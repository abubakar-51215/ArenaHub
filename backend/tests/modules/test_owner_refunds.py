"""Owner refunds: the list (own arenas only), marking a bank-transfer refund as paid
(once only), and the limits: never above what was paid, gateway refunds never by hand."""

from decimal import Decimal
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking, PaymentStatus
from app.modules.notification.model import Notification
from app.modules.payment.model import Payment, PaymentLifecycleStatus, Refund, RefundStatus
from tests.helpers import auth_header, make_admin, make_user
from tests.modules.test_group_cancel import _group_with_receipt, _paid_group


async def _cancelled_bank_group(client: AsyncClient, db: AsyncSession, tag: str) -> Any:
    """A bank-transfer group whose player cancelled with the receipt waiting: one pending refund."""
    owner, player, gid, payment, _, _ = await _group_with_receipt(client, db, tag, True)
    done = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert done.status_code == 200
    refund = (
        await db.execute(select(Refund).where(Refund.payment_id == payment["id"]))
    ).scalar_one()
    return owner, player, payment, refund


async def _count(db: AsyncSession, event: str, user_id: Any) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.event == event, Notification.user_id == user_id)
        )
        or 0
    )


async def test_owner_lists_only_refunds_on_own_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "or1")
    other_owner, _ = await make_user(client, db_session, "or1-other@example.com", "owner")

    mine = await client.get("/api/v1/owner/refunds", headers=auth_header(owner))
    assert mine.status_code == 200
    items = mine.json()["data"]["items"]
    assert len(items) == 1
    row = items[0]
    assert row["id"] == str(refund.id) and row["status"] == "pending"
    assert row["payment_method"] == "bank_transfer" and row["can_mark_paid"] is True
    assert row["booking_code"].startswith("AHB-") and row["player_name"] and row["arena_name"]
    assert row["court_name"]
    assert row["booking_date"] and row["start_time"] and row["end_time"] and row["created_at"]
    assert Decimal(row["amount"]) <= Decimal(payment["amount"])

    theirs = await client.get("/api/v1/owner/refunds?status=all", headers=auth_header(other_owner))
    assert theirs.json()["data"]["items"] == []
    processed = await client.get(
        "/api/v1/owner/refunds?status=processed", headers=auth_header(owner)
    )
    assert processed.json()["data"]["items"] == []
    # a player may not use the owner route
    assert (
        await client.get("/api/v1/owner/refunds", headers=auth_header(player))
    ).status_code == 403
    bad = await client.get("/api/v1/owner/refunds?status=nope", headers=auth_header(owner))
    assert bad.status_code == 422


async def test_owner_is_told_when_a_bank_transfer_refund_is_created(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "or2")
    owner_id = (await client.get("/api/v1/users/me", headers=auth_header(owner))).json()["data"][
        "id"
    ]
    assert await _count(db_session, "refund_to_send", owner_id) == 1


async def test_mark_paid_once_only_and_notifies_the_player_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "or3")
    other_owner, _ = await make_user(client, db_session, "or3-other@example.com", "owner")
    player_id = (await client.get("/api/v1/users/me", headers=auth_header(player))).json()["data"][
        "id"
    ]
    owner_id = (await client.get("/api/v1/users/me", headers=auth_header(owner))).json()["data"][
        "id"
    ]
    url = f"/api/v1/owner/refunds/{refund.id}/mark-paid"

    # another owner cannot touch it (and is not told it exists)
    assert (await client.post(url, headers=auth_header(other_owner))).status_code == 404
    # a player cannot either
    assert (await client.post(url, headers=auth_header(player))).status_code == 403

    first = await client.post(url, headers=auth_header(owner))
    assert first.status_code == 200
    data = first.json()["data"]
    assert data["already_processed"] is False and data["refund"]["status"] == "processed"
    assert data["refund"]["can_mark_paid"] is False
    await db_session.refresh(refund)
    assert refund.status == RefundStatus.processed
    assert refund.processed_at is not None and str(refund.processed_by) == owner_id
    pay = await db_session.get(Payment, refund.payment_id)
    assert pay is not None
    await db_session.refresh(pay)
    # a receipt-waiting cancel ends the payment as expired (a terminal state); the Refund row
    # holds the money
    assert pay.lifecycle_status == PaymentLifecycleStatus.expired
    events = (
        await client.get(f"/api/v1/payments/{pay.id}/events", headers=auth_header(player))
    ).json()["data"]
    assert any("marked as paid" in (e["note"] or "") for e in events)
    assert await _count(db_session, "refund_completed", player_id) == 1

    second = await client.post(url, headers=auth_header(owner))
    assert second.status_code == 200
    assert second.json()["data"]["already_processed"] is True
    assert "Already" in second.json()["message"]
    assert await _count(db_session, "refund_completed", player_id) == 1
    assert await _count(db_session, "refund_to_send", owner_id) == 1

    listed = await client.get("/api/v1/owner/refunds?status=processed", headers=auth_header(owner))
    assert [r["id"] for r in listed.json()["data"]["items"]] == [str(refund.id)]
    pending = await client.get("/api/v1/owner/refunds", headers=auth_header(owner))
    assert pending.json()["data"]["items"] == []


async def test_gateway_refunds_cannot_be_marked_by_hand(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, _ = await _paid_group(client, db_session, "or4", slot_count=1)
    from tests.modules.test_group_cancel import OWNERS

    owner = OWNERS["or4"]
    # a card refund stuck in "pending" (the gateway has not finished it)
    refund = Refund(
        booking_id=await _first_booking_id(db_session, payment["id"]),
        payment_id=payment["id"],
        amount=Decimal("100.00"),
        reason="stuck",
        status=RefundStatus.pending,
        gateway_attempts=1,
    )
    db_session.add(refund)
    await db_session.flush()
    res = await client.post(
        f"/api/v1/owner/refunds/{refund.id}/mark-paid", headers=auth_header(owner)
    )
    assert res.status_code == 422
    await db_session.refresh(refund)
    assert refund.status == RefundStatus.pending
    listed = await client.get("/api/v1/owner/refunds", headers=auth_header(owner))
    row = listed.json()["data"]["items"][0]
    assert row["payment_method"] == "card" and row["can_mark_paid"] is False


async def _first_booking_id(db: AsyncSession, payment_id: str) -> Any:
    from app.modules.booking.model import Booking

    pay = await db.get(Payment, payment_id)
    assert pay is not None
    return (
        (
            await db.execute(
                select(Booking.id).where(Booking.booking_group_id == pay.booking_group_id)
            )
        )
        .scalars()
        .first()
    )


async def test_mark_paid_refuses_a_refund_larger_than_the_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "or5")
    assert refund is not None
    pay = await db_session.get(Payment, refund.payment_id)
    assert pay is not None
    refund.amount = pay.amount + Decimal("1.00")  # a corrupted row: more than was paid
    await db_session.flush()
    res = await client.post(
        f"/api/v1/owner/refunds/{refund.id}/mark-paid", headers=auth_header(owner)
    )
    assert res.status_code == 409
    await db_session.refresh(refund)
    assert refund.status == RefundStatus.pending
    # and a normal cancel never creates more than was paid
    assert refund.amount - Decimal("1.00") <= pay.amount


async def test_mark_paid_on_a_confirmed_booking_keeps_the_payment_fully_refunded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, gid, payment, _, _ = await _group_with_receipt(client, db_session, "or6", True)
    ok = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/approve", headers=auth_header(owner)
    )
    assert ok.status_code == 200
    admin = await make_admin(client, db_session, "or6-admin@example.com")
    pay = await db_session.get(Payment, payment["id"])
    assert pay is not None
    ids = (
        (
            await db_session.execute(
                select(Booking.id).where(Booking.booking_group_id == pay.booking_group_id)
            )
        )
        .scalars()
        .all()
    )
    for booking_id in ids:  # both slots of the group: together they refund exactly what was paid
        forced = await client.post(
            f"/api/v1/admin/bookings/{booking_id}/force-refund", headers=auth_header(admin)
        )
        assert forced.status_code == 200
    refunds = (
        (await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"])))
        .scalars()
        .all()
    )
    assert len(refunds) == 2 and all(r.status == RefundStatus.pending for r in refunds)
    await db_session.refresh(pay)
    assert pay.lifecycle_status == PaymentLifecycleStatus.refunded
    # the coarse status (what admin Payments reads) must say "refunded" too, not stay
    # "completed" as if there were still money owed on this payment.
    for booking_id in ids:
        booking = await db_session.get(Booking, booking_id)
        assert booking is not None and booking.payment_status == PaymentStatus.refunded
    assert pay.status == PaymentStatus.refunded
    for r in refunds:
        res = await client.post(
            f"/api/v1/owner/refunds/{r.id}/mark-paid", headers=auth_header(owner)
        )
        assert res.status_code == 200 and res.json()["data"]["already_processed"] is False
    await db_session.refresh(pay)
    assert pay.lifecycle_status == PaymentLifecycleStatus.refunded
    total = await db_session.scalar(
        select(func.sum(Refund.amount)).where(Refund.payment_id == payment["id"])
    )
    assert total is not None and total <= pay.amount


async def test_owner_can_filter_refunds_by_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "or7")
    listed = (await client.get("/api/v1/owner/refunds", headers=auth_header(owner))).json()["data"]
    arena_id = listed["items"][0].get("arena_id")
    other = "00000000-0000-0000-0000-000000000000"
    none = await client.get(f"/api/v1/owner/refunds?arena_id={other}", headers=auth_header(owner))
    assert none.json()["data"]["items"] == []
    mine = (await client.get("/api/v1/owner/arenas", headers=auth_header(owner))).json()["data"]
    arenas = mine["items"] if isinstance(mine, dict) else mine
    one = await client.get(
        f"/api/v1/owner/refunds?arena_id={arenas[0]['id']}", headers=auth_header(owner)
    )
    assert [r["id"] for r in one.json()["data"]["items"]] == [str(refund.id)]
    assert arena_id is None or arena_id == arenas[0]["id"]
