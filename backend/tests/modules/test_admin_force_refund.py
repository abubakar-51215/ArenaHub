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
