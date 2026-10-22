"""Admin force-refund (FR, docs/11 §7): 100% once only, only on a paid booking, the
admin's reason recorded in the audit log, the existing refund notice sent, the slot
freed, and a second try refused."""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.model import AuditLog
from app.modules.notification.model import Notification
from app.modules.payment.model import Refund
from tests.helpers import auth_header, make_admin, make_user
from tests.modules.test_group_cancel import _paid_group
from tests.modules.test_payment import _slots


async def test_force_refund_pays_100_percent_once_and_refuses_a_second_try(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(
        client, db_session, "fr1", slot_count=1
    )
    booking_id = group["bookings"][0]["id"]
    admin = await make_admin(client, db_session, "fr1-admin@example.com")

    forced = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Court flooded — force majeure."},
    )
    assert forced.status_code == 200, forced.text
    refunded = (
        (await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"])))
        .scalars()
        .all()
    )
    assert len(refunded) == 1
    assert refunded[0].amount == Decimal(payment["amount"])  # 100%, the whole group's payment

    again = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Trying again."},
    )
    assert again.status_code == 409
    assert "already been fully refunded" in again.text


async def test_force_refund_makes_the_admin_payments_list_say_refunded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A payment force-refunded 100% must not keep reading "completed" in the admin
    Payments list, its status filter, or a CSV export of it — all three read the same
    coarse status field."""
    player, group, payment, court_id, monday = await _paid_group(
        client, db_session, "fr2", slot_count=1
    )
    booking_id = group["bookings"][0]["id"]
    admin = await make_admin(client, db_session, "fr2-admin@example.com")

    forced = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Court flooded — force majeure."},
    )
    assert forced.status_code == 200, forced.text

    listed = await client.get("/api/v1/admin/payments", headers=auth_header(admin))
    [row] = [p for p in listed.json()["data"]["items"] if p["id"] == payment["id"]]
    assert row["status"] == "refunded"
    assert row["lifecycle_status"] == "refunded"

    filtered = await client.get(
        "/api/v1/admin/payments", params={"status": "refunded"}, headers=auth_header(admin)
    )
    assert any(p["id"] == payment["id"] for p in filtered.json()["data"]["items"])
    not_completed = await client.get(
        "/api/v1/admin/payments", params={"status": "completed"}, headers=auth_header(admin)
    )
    assert not any(p["id"] == payment["id"] for p in not_completed.json()["data"]["items"])

    # This test's own db_session only ever has the one payment above in it, so the
    # whole CSV is enough to check without picking out a row by hand.
    csv = await client.get(
        "/api/v1/admin/reports", params={"type": "revenue", "format": "csv"},
        headers=auth_header(admin),
    )  # fmt: skip
    assert csv.status_code == 200, csv.text
    assert "Refunded" in csv.text
    assert "Paid" not in csv.text


async def test_a_partial_refund_shows_as_part_refunded_not_completed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Cancelling one slot of a three-slot group refunds a third of the payment —
    status stays "completed" by design (money is still owed for the other two
    slots), but the admin Payments list, filter and CSV must say "Part refunded",
    not look exactly like an untouched payment."""
    player, group, payment, _, _ = await _paid_group(client, db_session, "fr3", slot_count=3)
    admin = await make_admin(client, db_session, "fr3-admin@example.com")
    first = group["bookings"][0]["id"]
    cancelled = await client.post(
        f"/api/v1/bookings/{first}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200, cancelled.text

    listed = await client.get("/api/v1/admin/payments", headers=auth_header(admin))
    [row] = [p for p in listed.json()["data"]["items"] if p["id"] == payment["id"]]
    assert row["status"] == "completed"  # unchanged: not fully refunded
    assert row["partially_refunded"] is True

    csv = await client.get(
        "/api/v1/admin/reports", params={"type": "revenue", "format": "csv"},
        headers=auth_header(admin),
    )  # fmt: skip
    assert csv.status_code == 200, csv.text
    assert "Part refunded" in csv.text


async def test_force_refund_frees_the_slot_and_notifies_the_player(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.modules.booking.model import Booking

    player, group, payment, court_id, monday = await _paid_group(client, db_session, "fr2")
    booking_id = group["bookings"][0]["id"]
    admin = await make_admin(client, db_session, "fr2-admin@example.com")

    await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Arena closed for repairs."},
    )
    slots = await _slots(client, court_id, monday)
    freed = next(s for s in slots if s["id"] == group["bookings"][0]["slot_id"])
    assert freed["status"] == "available"

    booking = await db_session.get(Booking, booking_id)
    assert booking is not None
    notices = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.user_id == booking.player_id,
                    Notification.event == "refund_initiated",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(notices) == 1


async def test_force_refund_reason_and_actor_are_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "fr3")
    booking_id = group["bookings"][0]["id"]
    admin = await make_admin(client, db_session, "fr3-admin@example.com")

    await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Double-booked by mistake."},
    )
    rows = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.action == "payment.force_refund", AuditLog.target_id == booking_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].details["reason"] == "Double-booked by mistake."
    assert rows[0].actor_id is not None


async def test_force_refund_requires_a_reason(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "fr4")
    booking_id = group["bookings"][0]["id"]
    admin = await make_admin(client, db_session, "fr4-admin@example.com")

    missing = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund", headers=auth_header(admin), json={}
    )
    assert missing.status_code == 422


async def test_force_refund_needs_a_paid_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "fr5-owner@example.com", "owner")
    player, _ = await make_user(client, db_session, "fr5-player@example.com")
    admin = await make_admin(client, db_session, "fr5-admin@example.com")

    from tests.modules.test_review import _make_bookable_court

    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "fr5")
    slots = await _slots(client, court_id, monday)
    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]  # never paid

    refused = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund",
        headers=auth_header(admin),
        json={"reason": "Testing an unpaid booking."},
    )
    assert refused.status_code == 422
    assert "no completed payment" in refused.text.lower()
