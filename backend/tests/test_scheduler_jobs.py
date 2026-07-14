"""Tests for the functions the APScheduler jobs call (docs Sprint 3:
"tasks/ (APScheduler): auto-cancel, reminders 24h/1h, OTP/session cleanup").

The scheduler itself (interval timers) isn't exercised here — these call the
underlying async functions directly, which is what actually matters; the
`add_job(..., "interval", ...)` wiring in app/tasks/scheduler.py is trivial
glue with nothing to assert on.
"""

from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as auth_repo
from app.modules.auth import service as auth_service
from app.modules.auth.model import OtpVerification
from app.modules.booking import service as booking_service
from tests.helpers import PASSWORD, arena_payload, auth_header, make_admin, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7
    return today + timedelta(days=days_ahead)


async def test_send_upcoming_reminders_notifies_within_window(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "remowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "remplayer1@example.com", "player")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(require_full_payment=True)
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin-remowner1@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = (
        await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": monday.isoformat()})
    ).json()["data"]

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    import uuid as uuid_mod

    from app.modules.booking import repository as booking_repo
    from app.modules.booking.model import BookingStatus

    booking = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert booking is not None
    booking.status = BookingStatus.confirmed
    await db_session.commit()

    booking_start = datetime.combine(booking.booking_date, booking.start_time)

    # Right at the 24h mark -> notified.
    count = await booking_service.send_upcoming_reminders(
        db_session, now=booking_start - timedelta(hours=24)
    )
    assert count == 1

    # Far from either window -> nothing to notify.
    count = await booking_service.send_upcoming_reminders(
        db_session, now=booking_start - timedelta(hours=10)
    )
    assert count == 0

    # Right at the 1h mark -> notified again (no de-dup tracking yet, by design).
    count = await booking_service.send_upcoming_reminders(
        db_session, now=booking_start - timedelta(hours=1)
    )
    assert count == 1


async def test_complete_finished_bookings_transitions_past_end_time(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "compowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "compplayer1@example.com", "player")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(require_full_payment=True)
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin-compowner1@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = (
        await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": monday.isoformat()})
    ).json()["data"]

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    import uuid as uuid_mod

    from app.modules.booking import repository as booking_repo
    from app.modules.booking.model import BookingStatus

    booking = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert booking is not None
    booking.status = BookingStatus.confirmed
    await db_session.commit()

    booking_end = datetime.combine(booking.booking_date, booking.end_time)

    # Before the slot ends -> left confirmed.
    count = await booking_service.complete_finished_bookings(
        db_session, now=booking_end - timedelta(minutes=1)
    )
    assert count == 0
    unchanged = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert unchanged is not None
    assert unchanged.status == BookingStatus.confirmed

    # After the slot ends -> transitioned to completed.
    count = await booking_service.complete_finished_bookings(
        db_session, now=booking_end + timedelta(minutes=1)
    )
    assert count == 1
    finished = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert finished is not None
    assert finished.status == BookingStatus.completed


async def test_cleanup_expired_purges_old_otps_and_reset_tokens(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Cleanup Test",
            "email": "cleanup1@example.com",
            "phone": "03001234567",
            "password": PASSWORD,
            "role": "player",
        },
    )
    user = await auth_repo.get_user_by_email(db_session, "cleanup1@example.com")
    assert user is not None
    otp = await auth_repo.get_latest_otp(db_session, user.id)
    assert otp is not None

    # Backdate the OTP's expiry so it's eligible for cleanup.
    otp.expires_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.commit()

    otps_deleted, tokens_deleted = await auth_service.cleanup_expired(db_session)
    assert otps_deleted == 1
    assert tokens_deleted == 0

    remaining = await db_session.get(OtpVerification, otp.id)
    assert remaining is None
