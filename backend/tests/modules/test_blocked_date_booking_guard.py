"""Blocking a whole day guards against an owner accidentally wiping out live bookings:
refused with the count when any slot that day is booked or mid-payment, allowed once
those are cancelled, and every block/unblock is audited."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.model import AuditLog
from tests.helpers import auth_header, make_user
from tests.modules.test_review import _make_bookable_court, _slots


async def _audit_count(db: AsyncSession, action: str, target_id: str) -> int:
    return len(
        (
            await db.execute(
                select(AuditLog).where(AuditLog.action == action, AuditLog.target_id == target_id)
            )
        )
        .scalars()
        .all()
    )


async def test_blocking_a_date_with_a_live_booking_is_refused_with_the_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bdg-owner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "bdg-player1@example.com")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "bdg1")
    slots = await _slots(client, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    assert created.status_code in (200, 201), created.text

    refused = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=auth_header(owner),
        json={"blocked_date": monday.isoformat(), "reason": "Maintenance"},
    )
    assert refused.status_code == 409, refused.text
    assert "1 active booking" in refused.json()["message"]


async def test_blocking_a_date_succeeds_once_its_booking_is_cancelled(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bdg-owner2@example.com", "owner")
    player, _ = await make_user(client, db_session, "bdg-player2@example.com")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "bdg2")
    slots = await _slots(client, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = created.json()["data"]["booking_group_id"]

    refused = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=auth_header(owner),
        json={"blocked_date": monday.isoformat()},
    )
    assert refused.status_code == 409

    cancelled = await client.post(
        f"/api/v1/bookings/group/{group_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200

    now_blocked = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=auth_header(owner),
        json={"blocked_date": monday.isoformat()},
    )
    assert now_blocked.status_code == 201
    assert await _audit_count(db_session, "arena.block_date", arena_id) == 1

    blocked_id = now_blocked.json()["data"]["id"]
    unblocked = await client.delete(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates/{blocked_id}", headers=auth_header(owner)
    )
    assert unblocked.status_code == 200
    assert await _audit_count(db_session, "arena.unblock_date", arena_id) == 1


async def test_editing_or_deleting_a_booked_slot_is_audited_when_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bdg-owner3@example.com", "owner")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "bdg3")
    slots = await _slots(client, court_id, monday)
    slot_id = slots[0]["id"]
    h = auth_header(owner)

    edited = await client.patch(
        f"/api/v1/owner/courts/{court_id}/slots/{slot_id}",
        headers=h,
        json={"status": "maintenance"},
    )
    assert edited.status_code == 200
    assert await _audit_count(db_session, "slot.update", slot_id) == 1

    deleted = await client.delete(
        f"/api/v1/owner/courts/{court_id}/slots/{slots[1]['id']}", headers=h
    )
    assert deleted.status_code == 200
    assert await _audit_count(db_session, "slot.delete", slots[1]["id"]) == 1


async def test_a_date_blocked_first_then_refuses_a_booking_on_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The reverse order from the two tests above: block first (nothing booked yet, so
    it succeeds), then a booking attempt on that day is refused — the invariant "never
    both a live booking and a block on the same day" holds whichever happens first.
    True concurrent double-booking of one slot is covered separately by the Redis lock
    test (test_slot.py::test_slot_lock_prevents_concurrent_double_booking); firing two
    real HTTP requests at once here isn't meaningful because the test harness's DB
    session is one shared, non-reentrant transaction, not one per request."""
    owner, _ = await make_user(client, db_session, "bdg-owner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "bdg-player4@example.com")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "bdg4")
    slots = await _slots(client, court_id, monday)

    blocked = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=auth_header(owner),
        json={"blocked_date": monday.isoformat()},
    )
    assert blocked.status_code == 201

    refused = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    assert refused.status_code == 409
