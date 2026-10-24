"""Two hardening cases found while finishing the payment module (QA review, 24 Oct 2026):

* a correctly signed Stripe webhook whose body is not a Stripe event used to end in a server error;
  it is now refused as a bad request and confirms nothing;
* a payment that names a provider the app does not know used to make a cancellation fail (and one
  such row could stall the refund retry job); now that refund is a failed try (pending, retried,
  then flagged for manual handling) and the cancellation still goes through.
"""

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.payment import service as payment_service
from app.modules.payment.model import Payment, Refund, RefundStatus
from tests.helpers import auth_header
from tests.modules.test_group_cancel import _paid_group

SECRET = "whsec_unit_test_secret_value"


def _signed(body: dict) -> tuple[bytes, dict[str, str]]:
    raw = json.dumps(body).encode()
    ts = str(int(time.time()))
    mac = hmac.new(SECRET.encode(), f"{ts}.{raw.decode()}".encode(), hashlib.sha256).hexdigest()
    return raw, {"Stripe-Signature": f"t={ts},v1={mac}", "Content-Type": "application/json"}


@pytest.mark.real_gateway_rules
@pytest.mark.parametrize(
    "body",
    [
        {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {"id": "cs_1"}}},
        {"id": "evt_2", "object": "event", "type": "checkout.session.completed"},
    ],
    ids=["no object field", "no data"],
)
async def test_a_signed_body_that_is_not_a_stripe_event_is_a_bad_request(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, body: dict
) -> None:
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", SECRET)
    raw, headers = _signed(body)
    res = await client.post("/api/v1/webhooks/stripe", content=raw, headers=headers)
    assert res.status_code == 422, res.text


@pytest.mark.real_gateway_rules
async def test_a_wrongly_signed_stripe_webhook_is_still_refused(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", SECRET)
    raw, headers = _signed({"id": "evt_3", "object": "event", "type": "x", "data": {"object": {}}})
    headers["Stripe-Signature"] = headers["Stripe-Signature"][:-4] + "0000"
    res = await client.post("/api/v1/webhooks/stripe", content=raw, headers=headers)
    assert res.status_code == 422


async def test_a_payment_with_an_unknown_provider_does_not_break_the_cancellation(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "hd1")
    await db_session.execute(
        update(Payment).where(Payment.id == payment["id"]).values(payment_provider="nonsense")
    )
    await db_session.commit()

    res = await client.post(
        f"/api/v1/bookings/group/{group['booking_group_id']}/cancel",
        headers=auth_header(player),
        json={},
    )
    assert res.status_code == 200, res.text  # the booking is cancelled either way
    refund = (
        await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"]))
    ).scalar_one()
    assert refund.status == RefundStatus.pending
    assert refund.gateway_attempts == 1
    assert "nonsense" in (refund.last_error or "")

    # the retry job goes on through such a row instead of stopping on it
    await payment_service.retry_pending_refunds(db_session, datetime.now() + timedelta(days=1))
    await db_session.refresh(refund)
    assert refund.gateway_attempts == 2
