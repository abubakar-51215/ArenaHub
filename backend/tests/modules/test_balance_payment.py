"""Paying the balance online (what is still owed on a confirmed booking), by every way a first
payment can be made: only the booking's own player, the amount always from the server, no double
charge, a bank-transfer balance waits for the owner, the owner's lists and the refund cap."""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking import service as booking_service
from app.modules.booking.model import Booking, BookingStatus
from app.modules.payment.model import Payment, PaymentPurpose, Refund
from tests.helpers import auth_header, make_user
from tests.modules.test_group_cancel import OWNERS, _paid_group

RECEIPT = "/uploads/receipts/c898309f41b1f46378fc698549e1c592.jpg"


async def _advance_booking(client: AsyncClient, db: AsyncSession, tag: str, **kw: object) -> tuple:
    """A confirmed one-hour booking of 2000, half paid by card: 1000 is still owed."""
    return await _paid_group(client, db, tag, slot_count=1, payment_type="advance", **kw)  # type: ignore[arg-type]


async def _group(client: AsyncClient, player: dict, group_id: str) -> dict:
    resp = await client.get(f"/api/v1/bookings/group/{group_id}", headers=auth_header(player))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def _pay_balance(
    client: AsyncClient, player: dict, group_id: str, method: str = "card", **headers: str
) -> Response:
    return await client.post(
        "/api/v1/payments/initiate-balance",
        headers={**auth_header(player), **headers},
        json={"booking_group_id": group_id, "payment_method": method},
    )


async def _settle_by_card(client: AsyncClient, player: dict, group_id: str) -> dict:
    started = await _pay_balance(client, player, group_id)
    assert started.status_code == 200, started.text
    payment = started.json()["data"]["payment"]
    done = await client.post(
        f"/api/v1/payments/{payment['id']}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    assert done.status_code == 200, done.text
    return payment


async def test_the_booking_says_what_is_owed_and_whether_it_can_be_paid(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal1")
    details = await _group(client, player, group["booking_group_id"])
    assert details["balance_due"] == "1000.00"
    assert details["can_pay_balance"] is True
    assert details["balance_payment"] is None

    paid_in_full, group2, *_ = await _paid_group(client, db_session, "bal1b", slot_count=1)
    settled = await _group(client, paid_in_full, group2["booking_group_id"])
    assert settled["balance_due"] == "0.00" or Decimal(settled["balance_due"]) == 0
    assert settled["can_pay_balance"] is False


async def test_a_card_balance_settles_the_booking_and_the_button_goes(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal2")
    gid = group["booking_group_id"]
    payment = await _settle_by_card(client, player, gid)
    assert payment["purpose"] == "balance"
    assert Decimal(payment["amount"]) == Decimal("1000")

    details = await _group(client, player, gid)
    assert Decimal(details["balance_due"]) == 0
    assert details["can_pay_balance"] is False
    assert details["status"] == "confirmed"
    # nothing left to pay: the route refuses
    again = await _pay_balance(client, player, gid)
    assert again.status_code == 422
    assert "no outstanding balance" in again.text


async def test_a_bank_transfer_balance_waits_for_the_owner_then_settles(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal3")
    gid = group["booking_group_id"]
    owner = OWNERS["bal3"]

    started = await _pay_balance(client, player, gid, "bank_transfer")
    assert started.status_code == 200, started.text
    payment = started.json()["data"]["payment"]
    assert payment["purpose"] == "balance" and payment["status"] == "pending"
    assert Decimal(payment["amount"]) == Decimal("1000")

    # leaving the bank screen and coming back carries on with the same payment
    resumed = await _pay_balance(client, player, gid, "bank_transfer")
    assert resumed.json()["data"]["payment"]["id"] == payment["id"]
    assert (await _group(client, player, gid))["can_pay_balance"] is True

    sent = await client.post(
        f"/api/v1/payments/{payment['id']}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": RECEIPT},
    )
    assert sent.status_code == 200, sent.text
    waiting = await _group(client, player, gid)
    assert waiting["status"] == "confirmed"  # the booking itself is untouched
    assert waiting["balance_payment"] == "awaiting_approval"
    assert waiting["can_pay_balance"] is False
    assert Decimal(waiting["balance_due"]) == Decimal("1000")

    # the owner sees it in the approval queue and in the count
    queue = await client.get(
        "/api/v1/owner/dashboard/pending-approvals", headers=auth_header(owner)
    )
    [item] = queue.json()["data"]["items"]
    assert item["purpose"] == "balance"
    assert item["payment_id"] == payment["id"]
    assert Decimal(item["payment_amount"]) == Decimal("1000")
    summary = await client.get("/api/v1/owner/dashboard/summary", headers=auth_header(owner))
    assert summary.json()["data"]["pending_approvals"] == 1

    approved = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/approve", headers=auth_header(owner)
    )
    assert approved.status_code == 200, approved.text
    settled = await _group(client, player, gid)
    assert Decimal(settled["balance_due"]) == 0
    assert settled["balance_payment"] is None and settled["can_pay_balance"] is False
    queue = await client.get(
        "/api/v1/owner/dashboard/pending-approvals", headers=auth_header(owner)
    )
    assert queue.json()["data"]["items"] == []


async def test_a_rejected_balance_receipt_leaves_the_balance_owed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal4")
    gid = group["booking_group_id"]
    owner = OWNERS["bal4"]
    payment = (await _pay_balance(client, player, gid, "bank_transfer")).json()["data"]["payment"]
    await client.post(
        f"/api/v1/payments/{payment['id']}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": RECEIPT},
    )
    rejected = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/reject",
        headers=auth_header(owner),
        json={"reason": "The amount does not match."},
    )
    assert rejected.status_code == 200, rejected.text
    after = await _group(client, player, gid)
    assert after["status"] == "confirmed"  # a rejected balance never cancels the booking
    assert Decimal(after["balance_due"]) == Decimal("1000")
    assert after["can_pay_balance"] is True
    # ... and it can be paid again
    again = await _pay_balance(client, player, gid, "bank_transfer")
    assert again.status_code == 200
    assert again.json()["data"]["payment"]["id"] != payment["id"]


async def test_only_the_bookings_own_player_can_pay_its_balance(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal5")
    gid = group["booking_group_id"]
    stranger, _ = await make_user(client, db_session, "bal5-stranger@example.com", "player")
    refused = await _pay_balance(client, stranger, gid)
    assert refused.status_code == 404
    owner = OWNERS["bal5"]
    assert (await _pay_balance(client, owner, gid)).status_code == 403
    assert (await _group(client, player, gid))["balance_payment"] is None


async def test_the_amount_always_comes_from_the_server(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal6")
    gid = group["booking_group_id"]
    sneaky = await client.post(
        "/api/v1/payments/initiate-balance",
        headers=auth_header(player),
        json={"booking_group_id": gid, "payment_method": "card", "amount": "1.00"},
    )
    assert sneaky.status_code == 422  # a request cannot carry an amount at all
    real = await _pay_balance(client, player, gid)
    assert Decimal(real.json()["data"]["payment"]["amount"]) == Decimal("1000")


async def test_a_second_tap_does_not_charge_twice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal7")
    gid = group["booking_group_id"]
    key = {"Idempotency-Key": "balance-tap-0001"}
    first = await _pay_balance(client, player, gid, **key)
    second = await _pay_balance(client, player, gid, **key)
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["payment"]["id"] == second.json()["data"]["payment"]["id"]
    rows = (
        (
            await db_session.execute(
                select(Payment).where(
                    Payment.booking_group_id == gid, Payment.purpose == PaymentPurpose.balance
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    # a different key (a real second attempt) still cannot start a second charge
    third = await _pay_balance(client, player, gid, **{"Idempotency-Key": "balance-tap-0002"})
    assert third.status_code == 409


async def test_a_cancelled_or_completed_booking_has_no_balance_to_pay(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal8")
    gid = group["booking_group_id"]
    booking = await db_session.get(Booking, group["bookings"][0]["id"])
    assert booking is not None
    booking.status = BookingStatus.completed
    await db_session.commit()
    details = await _group(client, player, gid)
    assert Decimal(details["balance_due"]) == 0 and details["can_pay_balance"] is False
    assert (await _pay_balance(client, player, gid)).status_code == 422

    player2, group2, *_ = await _advance_booking(client, db_session, "bal8b")
    gid2 = group2["booking_group_id"]
    cancelled = await client.post(
        f"/api/v1/bookings/group/{gid2}/cancel", headers=auth_header(player2), json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    after = await _group(client, player2, gid2)
    assert Decimal(after["balance_due"]) == 0 and after["can_pay_balance"] is False
    assert (await _pay_balance(client, player2, gid2)).status_code == 422


async def test_the_owner_report_and_earnings_count_the_balance_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal9")
    gid = group["booking_group_id"]
    owner = OWNERS["bal9"]
    await _settle_by_card(client, player, gid)

    report = await client.get(
        "/api/v1/owner/reports",
        headers=auth_header(owner),
        params={"type": "payment", "format": "csv"},
    )
    assert report.status_code == 200, report.text
    lines = report.text.splitlines()[1:]
    assert len(lines) == 2  # the first payment and the balance: one row each
    assert sum("Rs. 1,000" in line for line in lines) == 2

    from app.modules.payment import repository as payment_repo

    details = await _group(client, player, gid)
    total = await payment_repo.sum_revenue_for_arenas(db_session, [uuid.UUID(details["arena_id"])])
    assert total == Decimal("2000")  # 1000 first payment + 1000 balance, each once


async def test_cancelling_after_a_balance_refunds_by_policy_and_never_over_the_cap(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, first_payment, *_ = await _advance_booking(client, db_session, "bal10")
    gid = group["booking_group_id"]
    balance = await _settle_by_card(client, player, gid)

    cancelled = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    refunds = (await db_session.execute(select(Refund))).scalars().all()
    by_payment: dict[str, Decimal] = {}
    for refund in refunds:
        by_payment[str(refund.payment_id)] = (
            by_payment.get(str(refund.payment_id), Decimal(0)) + refund.amount
        )
    # POLICY_FULL: 100% back. Both payments (1000 + 1000) return, each within its own amount.
    assert by_payment[balance["id"]] == Decimal("1000")
    assert by_payment[first_payment["id"]] == Decimal("1000")
    details = await _group(client, player, gid)
    assert Decimal(details["refund_amount"]) == Decimal("2000")


async def test_a_late_cancel_after_a_balance_refunds_the_policy_share_of_the_whole(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    half = [{"hours_before": 24, "refund_percentage": 50}]
    player, group, first_payment, *_ = await _advance_booking(
        client, db_session, "bal11", policy=half
    )
    gid = group["booking_group_id"]
    await _settle_by_card(client, player, gid)
    preview = await client.get(
        f"/api/v1/bookings/group/{gid}/cancel-preview", headers=auth_header(player)
    )
    assert preview.status_code == 200, preview.text
    assert Decimal(preview.json()["data"]["paid"]) == Decimal("2000")
    cancelled = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    details = await _group(client, player, gid)
    # the booking is days away, so the first tier (100%) or the 50% tier applies; either way the
    # refund equals the preview and is never more than was paid
    assert Decimal(details["refund_amount"]) == Decimal(preview.json()["data"]["refund_amount"])
    assert Decimal(details["refund_amount"]) <= Decimal("2000")


async def test_cancelling_with_a_balance_receipt_waiting_returns_that_money(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal12")
    gid = group["booking_group_id"]
    payment = (await _pay_balance(client, player, gid, "bank_transfer")).json()["data"]["payment"]
    await client.post(
        f"/api/v1/payments/{payment['id']}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": RECEIPT},
    )
    cancelled = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    refunds = (
        (await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"])))
        .scalars()
        .all()
    )
    assert [r.amount for r in refunds] == [Decimal("1000.00")]  # the receipt's money, pending
    row = await db_session.get(Payment, payment["id"])
    assert row is not None and row.status.value == "failed"  # the open payment is closed


async def test_force_refund_after_a_balance_returns_everything_captured(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.helpers import make_admin

    player, group, first_payment, *_ = await _advance_booking(client, db_session, "bal13")
    gid = group["booking_group_id"]
    balance = await _settle_by_card(client, player, gid)
    admin = await make_admin(client, db_session, "bal13-admin@example.com")
    forced = await client.post(
        f"/api/v1/admin/bookings/{group['bookings'][0]['id']}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Court flooded — force majeure."},
    )
    assert forced.status_code == 200, forced.text
    refunds = (await db_session.execute(select(Refund))).scalars().all()
    assert sum((r.amount for r in refunds), Decimal(0)) == Decimal("2000")
    assert {str(r.payment_id) for r in refunds} == {balance["id"], first_payment["id"]}
    again = await client.post(
        f"/api/v1/admin/bookings/{group['bookings'][0]['id']}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Trying again."},
    )
    assert again.status_code == 409


async def test_an_abandoned_balance_payment_expires_so_a_new_one_can_start(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal14")
    gid = group["booking_group_id"]
    abandoned = (await _pay_balance(client, player, gid)).json()["data"]["payment"]
    waiting = await client.post(
        "/api/v1/payments/initiate-balance",
        headers=auth_header(player),
        json={"booking_group_id": gid, "payment_method": "bank_transfer"},
    )
    assert waiting.status_code == 409  # the card attempt is still open

    await booking_service.auto_cancel_stale_bookings(
        db_session, now=datetime.now() + timedelta(hours=25)
    )
    row = await db_session.get(Payment, abandoned["id"])
    assert row is not None
    await db_session.refresh(row)
    assert row.status.value == "failed"
    fresh = await _pay_balance(client, player, gid, "bank_transfer")
    assert fresh.status_code == 200


async def test_the_booking_shows_how_much_balance_was_paid(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, *_ = await _advance_booking(client, db_session, "bal15")
    gid = group["booking_group_id"]
    assert Decimal((await _group(client, player, gid))["balance_paid"]) == 0
    await _settle_by_card(client, player, gid)
    assert Decimal((await _group(client, player, gid))["balance_paid"]) == Decimal("1000")
