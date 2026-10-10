"""The two small endpoints behind the Arena screen and the 7-day strip:
GET /courts/{id}/availability and GET /arenas/{id}/slots-today. Time is fixed
at 12:00 today so the counts do not depend on when the tests run."""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.slot import service as slot_service
from app.modules.slot.model import SlotStatus, TimeSlot
from tests.helpers import arena_payload, auth_header, make_admin, make_user

ALL_DAYS = {
    d: {"open": "08:00", "close": "23:00"}
    for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
}
TODAY = date.today()


@pytest.fixture(autouse=True)
def _noon(monkeypatch):
    monkeypatch.setattr(slot_service, "_now", lambda: datetime.combine(TODAY, time(12, 0)))


async def _arena_with_courts(
    client: AsyncClient, db: AsyncSession, tag: str, courts: int = 1, approve: bool = True
):
    owner, _ = await make_user(client, db, f"ss-{tag}@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(operating_hours=ALL_DAYS)
    )
    arena_id = arena.json()["data"]["id"]
    if approve:
        admin = await make_admin(client, db, f"ss-admin-{tag}@example.com")
        await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court_ids = []
    for n in range(courts):
        created = await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": f"Court {n}", "sport_types": ["futsal"], "base_price": "2000.00"},
        )
        court_id = created.json()["data"]["id"]
        await client.post(
            f"/api/v1/owner/courts/{court_id}/slots/generate",
            headers=h,
            json={
                "start_date": TODAY.isoformat(),
                "end_date": (TODAY + timedelta(days=2)).isoformat(),
            },
        )
        court_ids.append(court_id)
    return arena_id, court_ids


async def _slots(db: AsyncSession, court_id: str, day: date) -> list[TimeSlot]:
    rows = await db.execute(
        select(TimeSlot)
        .where(TimeSlot.court_id == uuid.UUID(court_id), TimeSlot.date == day)
        .order_by(TimeSlot.start_time)
    )
    return list(rows.scalars().all())


async def test_availability_counts_open_slots_per_day_and_hides_past_times_today(
    client, db_session
):
    _, (court_id,) = await _arena_with_courts(client, db_session, "av1")
    tomorrow = await _slots(db_session, court_id, TODAY + timedelta(days=1))
    tomorrow[0].status = SlotStatus.booked
    tomorrow[1].status = SlotStatus.reserved
    await db_session.commit()

    res = await client.get(
        f"/api/v1/courts/{court_id}/availability",
        params={"from": TODAY.isoformat(), "to": (TODAY + timedelta(days=3)).isoformat()},
    )

    assert res.status_code == 200
    counts = {row["date"]: row["open_count"] for row in res.json()["data"]}
    # 08:00 to 23:00 is 15 hourly slots; today only those starting after 12:00 (13:00 to 22:00)
    assert counts[TODAY.isoformat()] == 10
    assert counts[(TODAY + timedelta(days=1)).isoformat()] == 13  # one booked, one held
    assert counts[(TODAY + timedelta(days=2)).isoformat()] == 15
    assert counts[(TODAY + timedelta(days=3)).isoformat()] == 0  # no slots made for that day


async def test_availability_rejects_a_bad_range_and_an_unknown_court(client, db_session):
    _, (court_id,) = await _arena_with_courts(client, db_session, "av2")
    url = f"/api/v1/courts/{court_id}/availability"

    backwards = await client.get(url, params={"from": "2026-10-10", "to": "2026-10-09"})
    too_long = await client.get(url, params={"from": "2026-10-01", "to": "2026-12-01"})
    unknown = await client.get(
        f"/api/v1/courts/{uuid.uuid4()}/availability",
        params={"from": "2026-10-01", "to": "2026-10-02"},
    )

    assert backwards.status_code == 422
    assert too_long.status_code == 422
    assert unknown.status_code == 404


async def test_slots_today_gives_open_count_and_lowest_price_per_court(client, db_session):
    arena_id, (court_a, court_b) = await _arena_with_courts(client, db_session, "st1", courts=2)
    a_slots = await _slots(db_session, court_a, TODAY)
    next(s for s in a_slots if s.start_time == time(18, 0)).price = Decimal("1600.00")
    for slot in await _slots(db_session, court_b, TODAY):  # court B: everything taken
        slot.status = SlotStatus.booked
    await db_session.commit()

    res = await client.get(f"/api/v1/arenas/{arena_id}/slots-today")

    assert res.status_code == 200
    by_court = {row["court_id"]: row for row in res.json()["data"]}
    assert by_court[court_a]["open_count"] == 10
    assert Decimal(str(by_court[court_a]["lowest_price"])) == Decimal("1600.00")
    assert by_court[court_b]["open_count"] == 0
    assert by_court[court_b]["lowest_price"] is None


async def test_slots_today_hides_an_arena_that_is_not_live(client, db_session):
    arena_id, _ = await _arena_with_courts(client, db_session, "st2", approve=False)

    res = await client.get(f"/api/v1/arenas/{arena_id}/slots-today")

    assert res.status_code == 404
