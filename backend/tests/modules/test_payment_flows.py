"""The three ways to pay, end to end:

* card: Stripe's hosted card page (a built-in test page in development) -> paid -> the booking
  is confirmed at once, no owner step;
* JazzCash / EasyPaisa: the player's wallet number -> a payment request to that wallet -> paid
  -> confirmed at once, no owner step;
* bank transfer: a receipt -> the owner approves (covered in test_payment.py).
"""

import json
from types import SimpleNamespace
from typing import Any
from urllib.parse import parse_qs, quote, urlparse

import pytest
import stripe
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Environment, get_settings
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _create_booking_group, _make_bookable_court, _slots

pytestmark = pytest.mark.real_gateway_rules  # the real providers (no test stand-in swapped in)

APP_RETURN = "exp://192.168.1.5:8081/--/booking/return"


async def _group(client: AsyncClient, db: AsyncSession, tag: str) -> tuple[dict, dict, str]:
    owner, _ = await make_user(client, db, f"flow-owner-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"flow-player-{tag}@example.com", "player")
    _, court, day = await _make_bookable_court(client, db, owner, f"flow-owner-{tag}")
    slots = await _slots(client, court, day)
    return owner, player, await _create_booking_group(client, player, court, slots[0]["id"])


async def _status(client: AsyncClient, player: dict) -> str:
    res = await client.get("/api/v1/bookings", headers=auth_header(player))
    status: str = res.json()["data"]["items"][0]["status"]
    return status


async def _start(client: AsyncClient, player: dict, group: str, **extra: Any) -> Any:
    return await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group, **extra},
    )


# ---- card -----------------------------------------------------------------------------------


async def test_card_payment_on_the_card_page_confirms_the_booking_at_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, group = await _group(client, db_session, "card")
    started = await _start(client, player, group, payment_method="card", return_url=APP_RETURN)
    assert started.status_code == 200, started.text
    page_url = started.json()["data"]["redirect_url"]
    api = get_settings().api_public_url.rstrip("/")
    assert page_url.startswith(f"{api}/api/v1/payments/dev-checkout/cs_sim_")
    assert await _status(client, player) == "pending_payment"

    path = page_url[len(api) :]
    page = await client.get(path)
    assert page.status_code == 200 and "Development only" in page.text and "Pay Rs" in page.text

    paid = await client.post(path + "&result=paid")
    assert paid.status_code == 303
    back = paid.headers["location"]
    assert back.startswith(f"{api}/api/v1/payments/return?to=")
    # confirmed straight away: no owner approval for a card payment
    assert await _status(client, player) == "confirmed"

    to_app = await client.get(back[len(api) :])
    assert to_app.status_code == 302 and to_app.headers["location"] == APP_RETURN


async def test_cancelling_on_the_card_page_does_not_book(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, group = await _group(client, db_session, "cardx")
    started = await _start(client, player, group, payment_method="card", return_url=APP_RETURN)
    path = started.json()["data"]["redirect_url"].split("://", 1)[1].split("/", 1)[1]
    res = await client.post("/" + path + "&result=cancel")
    assert res.status_code == 303
    assert await _status(client, player) != "confirmed"


async def test_card_page_return_address_must_be_an_app_address(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, group = await _group(client, db_session, "cardr")
    evil = await _start(
        client, player, group, payment_method="card", return_url="https://evil.example/x"
    )
    assert evil.status_code == 422
    for to in ("https://evil.example", "javascript:alert(1)", "//evil.example", "arenahub:\\x"):
        res = await client.get(f"/api/v1/payments/return?to={quote(to, safe='')}")
        assert res.status_code == 422, to
    ok = await client.get(f"/api/v1/payments/return?to={quote('arenahub://booking/return')}")
    assert ok.status_code == 302


async def test_the_test_card_page_does_not_exist_outside_development(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player, group = await _group(client, db_session, "cardp")
    started = await _start(client, player, group, payment_method="card", return_url=APP_RETURN)
    path = "/" + started.json()["data"]["redirect_url"].split("://", 1)[1].split("/", 1)[1]
    monkeypatch.setattr(get_settings(), "environment", Environment.staging)
    assert (await client.get(path)).status_code == 404
    assert (await client.post(path + "&result=paid")).status_code == 404
    assert await _status(client, player) == "pending_payment"


async def test_with_a_stripe_key_the_card_page_is_stripe_checkout_and_its_webhook_confirms(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player, group = await _group(client, db_session, "stripe")
    settings = get_settings()
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_" + "a1b2c3d4e5" * 3)
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_test")
    made: dict[str, Any] = {}

    def create(**kwargs: Any) -> Any:
        made.update(kwargs)
        return SimpleNamespace(
            id="cs_test_123", url="https://checkout.stripe.com/c/pay/cs_test_123"
        )

    monkeypatch.setattr(stripe.checkout.Session, "create", create)
    started = await _start(client, player, group, payment_method="card", return_url=APP_RETURN)
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    assert data["redirect_url"] == "https://checkout.stripe.com/c/pay/cs_test_123"
    assert made["mode"] == "payment"
    unit = made["line_items"][0]["price_data"]["unit_amount"]
    assert unit == int(float(data["payment"]["amount"]) * 100)
    back = parse_qs(urlparse(made["success_url"]).query)["to"][0]
    assert back == APP_RETURN and made["success_url"].startswith(settings.api_public_url)

    def event(kind: str, paid: str = "paid") -> dict:
        return {
            "type": kind,
            "data": {
                "object": {
                    "id": "cs_test_123",
                    "payment_status": paid,
                    "amount_total": unit,
                    "currency": "pkr",
                }
            },
        }

    sent: list[dict] = []
    monkeypatch.setattr(stripe.Webhook, "construct_event", lambda *a, **k: sent.pop(0))
    # an event that changes nothing is acknowledged
    sent.append(event("payment_intent.created"))
    ignored = await client.post("/api/v1/webhooks/stripe", content=b"{}")
    assert ignored.status_code == 200
    assert await _status(client, player) == "pending_payment"
    # paid on Stripe's page: confirmed at once
    sent.append(event("checkout.session.completed"))
    done = await client.post("/api/v1/webhooks/stripe", content=json.dumps({}).encode())
    assert done.status_code == 200
    assert await _status(client, player) == "confirmed"


# ---- JazzCash / EasyPaisa --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "label"), [("jazzcash", "JazzCash"), ("easypaisa", "EasyPaisa")]
)
async def test_a_wallet_payment_needs_a_pakistani_mobile_number(
    client: AsyncClient, db_session: AsyncSession, method: str, label: str
) -> None:
    _, player, group = await _group(client, db_session, f"w-{method}")
    missing = await _start(client, player, group, payment_method=method)
    assert missing.status_code == 422
    assert missing.json()["message"] == f"Enter your {label} number."
    for bad in ("12345", "0421234567", "+44 7700 900123"):
        res = await _start(client, player, group, payment_method=method, wallet_number=bad)
        assert res.status_code == 422, bad


@pytest.mark.parametrize("method", ["jazzcash", "easypaisa"])
async def test_a_wallet_payment_request_then_payment_confirms_the_booking_at_once(
    client: AsyncClient, db_session: AsyncSession, method: str
) -> None:
    _, player, group = await _group(client, db_session, f"wp-{method}")
    started = await _start(
        client, player, group, payment_method=method, wallet_number="+92 300 123 4567"
    )
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    assert data["redirect_url"] is None  # the request goes to the wallet app, not a web page
    payment_id = data["payment"]["id"]
    events = await client.get(f"/api/v1/payments/{payment_id}/events", headers=auth_header(player))
    notes = [e["note"] for e in events.json()["data"]]
    assert "Payment request sent to 0300•••4567." in notes
    assert all("1234567" not in (n or "") for n in notes)
    assert await _status(client, player) == "pending_payment"

    # the player approves in the wallet app (simulated in development)
    paid = await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    assert paid.status_code == 200
    assert await _status(client, player) == "confirmed"


async def test_wallet_payments_refuse_outside_development_until_the_real_api_is_connected(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player, group = await _group(client, db_session, "wprod")
    monkeypatch.setattr(get_settings(), "environment", Environment.staging)
    res = await _start(
        client, player, group, payment_method="jazzcash", wallet_number="03001234567"
    )
    assert res.status_code == 503
    assert res.json()["message"] == "JazzCash is coming soon."
