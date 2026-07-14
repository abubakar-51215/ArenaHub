"""Slot generation/edit/delete tests + the mandatory Redis lock concurrency
test for the booking engine (docs/15 Sprint 3 exit criterion)."""

import asyncio
import uuid
from datetime import date, time, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import locking
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus
from tests.helpers import arena_payload, auth_header, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7  # always strictly in the future
    return today + timedelta(days=days_ahead)


async def _make_owned_court(
    client: AsyncClient, owner: dict, **arena_overrides: object
) -> tuple[str, str]:
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(**arena_overrides)
    )
    arena_id = arena.json()["data"]["id"]
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    return arena_id, court.json()["data"]["id"]


async def test_generate_slots_creates_hourly_slots_from_operating_hours(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "slotowner1@example.com", "owner")
    h = auth_header(owner)
    _, court_id = await _make_owned_court(client, owner)

    monday = _next_weekday(1)  # operating_hours: monday 08:00-23:00 -> 15 hourly slots
    resp = await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert body["created"] == 15
    assert body["skipped_existing"] == 0

    listed = await client.get(
        f"/api/v1/owner/courts/{court_id}/slots", headers=h, params={"date": monday.isoformat()}
    )
    slots = listed.json()["data"]
    assert len(slots) == 15
    assert slots[0]["start_time"] == "08:00:00"
    assert slots[0]["status"] == "available"
    assert slots[0]["price"] == "2000.00"


async def test_generate_slots_skips_closed_days_and_blocked_dates(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "slotowner2@example.com", "owner")
    h = auth_header(owner)
    arena_id, court_id = await _make_owned_court(client, owner)

    # A full 7-day window starting tomorrow contains exactly one of each
    # weekday, so start_date is always <= end_date regardless of today.
    start_date = date.today() + timedelta(days=1)
    end_date = start_date + timedelta(days=6)
    saturday = next(
        start_date + timedelta(days=i)
        for i in range(7)
        if (start_date + timedelta(days=i)).isoweekday() == 6
    )
    tuesday = next(
        start_date + timedelta(days=i)
        for i in range(7)
        if (start_date + timedelta(days=i)).isoweekday() == 2
    )

    # Block the Saturday in range (which is otherwise open per arena_payload).
    await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=h,
        json={"blocked_date": saturday.isoformat(), "reason": "Maintenance"},
    )

    resp = await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    # Only monday + saturday are open per arena_payload's operating_hours,
    # and saturday is blocked, so only monday's 15 slots get created.
    assert body["created"] == 15
    assert tuesday.isoformat() in body["skipped_closed_or_blocked"]
    assert saturday.isoformat() in body["skipped_closed_or_blocked"]


async def test_generate_slots_is_idempotent(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "slotowner3@example.com", "owner")
    h = auth_header(owner)
    _, court_id = await _make_owned_court(client, owner)
    monday = _next_weekday(1)

    first = await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    second = await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    assert first.json()["data"]["created"] == 15
    assert second.json()["data"]["created"] == 0
    assert second.json()["data"]["skipped_existing"] == 15


async def test_public_slots_hidden_for_unavailable_court(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "slotowner4@example.com", "owner")
    h = auth_header(owner)
    _, court_id = await _make_owned_court(client, owner)
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )

    await client.patch(
        f"/api/v1/owner/courts/{court_id}/availability", headers=h, json={"is_available": False}
    )
    hidden = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": monday.isoformat()}
    )
    assert hidden.status_code == 404

    await client.patch(
        f"/api/v1/owner/courts/{court_id}/availability", headers=h, json={"is_available": True}
    )
    visible = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": monday.isoformat()}
    )
    assert visible.status_code == 200
    assert len(visible.json()["data"]) == 15


async def test_update_and_delete_slot_blocked_when_booked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "slotowner5@example.com", "owner")
    h = auth_header(owner)
    _, court_id = await _make_owned_court(client, owner)
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = (
        await client.get(
            f"/api/v1/owner/courts/{court_id}/slots", headers=h, params={"date": monday.isoformat()}
        )
    ).json()["data"]
    slot_id = slots[0]["id"]

    blocked = await client.patch(
        f"/api/v1/owner/courts/{court_id}/slots/{slot_id}",
        headers=h,
        json={"status": "maintenance"},
    )
    assert blocked.status_code == 200
    assert blocked.json()["data"]["status"] == "maintenance"

    deletable_id = slots[1]["id"]
    deleted = await client.delete(
        f"/api/v1/owner/courts/{court_id}/slots/{deletable_id}", headers=h
    )
    assert deleted.status_code == 200

    # A booked slot (simulated directly, since booking creation lands next
    # sprint step) can't be edited or deleted.
    booked_slot = await slot_repo.get_slot(db_session, slots[2]["id"])
    assert booked_slot is not None
    booked_slot.status = SlotStatus.booked
    await db_session.commit()

    rejected_edit = await client.patch(
        f"/api/v1/owner/courts/{court_id}/slots/{slots[2]['id']}",
        headers=h,
        json={"status": "maintenance"},
    )
    assert rejected_edit.status_code == 422

    rejected_delete = await client.delete(
        f"/api/v1/owner/courts/{court_id}/slots/{slots[2]['id']}", headers=h
    )
    assert rejected_delete.status_code == 422


# ---- Redis distributed lock (docs/11 section 3) --------------------------


async def test_slot_lock_prevents_concurrent_double_booking() -> None:
    """Two simultaneous attempts on the same slot: exactly one acquires the
    lock — the mandatory Sprint 3 concurrency test (docs/15 exit criteria)."""
    court_id = uuid.uuid4()
    booking_date = date.today()
    start_time = time(18, 0)

    results = await asyncio.gather(
        *[locking.acquire_slot_lock(court_id, booking_date, start_time) for _ in range(10)]
    )
    acquired_count = sum(1 for ok, _, _ in results if ok)
    assert acquired_count == 1


async def test_slot_lock_release_then_reacquire() -> None:
    court_id = uuid.uuid4()
    booking_date = date.today()
    start_time = time(19, 0)

    ok1, key1, token1 = await locking.acquire_slot_lock(court_id, booking_date, start_time)
    assert ok1

    ok2, _, _ = await locking.acquire_slot_lock(court_id, booking_date, start_time)
    assert not ok2

    # A mismatched token must not release someone else's lock.
    await locking.release_slot_lock(key1, "not-the-real-token")
    ok3, _, _ = await locking.acquire_slot_lock(court_id, booking_date, start_time)
    assert not ok3

    await locking.release_slot_lock(key1, token1)
    ok4, _, _ = await locking.acquire_slot_lock(court_id, booking_date, start_time)
    assert ok4
