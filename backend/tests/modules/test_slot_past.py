"""The player's slot list never offers a slot that has already started (Karachi time = the server
clock). The owner's own list still shows every slot, and booking a past slot is refused."""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.slot import service as slot_service
from app.modules.slot.model import SlotStatus, TimeSlot
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_payment import ALL_WEEK_HOURS


async def _court(client: AsyncClient, db: AsyncSession, tag: str) -> tuple[dict, str]:
    owner, _ = await make_user(client, db, f"past-{tag}@example.com", "owner")
    admin = await make_admin(client, db, f"past-{tag}-admin@example.com")
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(operating_hours=ALL_WEEK_HOURS),
    )
    arena_id = arena.json()["data"]["id"]
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    return owner, court.json()["data"]["id"]


async def _hours(db: AsyncSession, court_id: str, day: date) -> list[TimeSlot]:
    rows = []
    for h in range(0, 24):
        row = TimeSlot(
            court_id=uuid.UUID(court_id),
            date=day,
            start_time=time(h, 0),
            end_time=time(h, 59) if h == 23 else time(h + 1, 0),
            status=SlotStatus.available,
            price=Decimal("2000.00"),
        )
        db.add(row)
        rows.append(row)
    await db.commit()
    return rows


async def test_past_day_returns_nothing_tomorrow_returns_everything(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, court_id = await _court(client, db_session, "a")
    yesterday = date.today() - timedelta(days=1)
    tomorrow = date.today() + timedelta(days=1)
    await _hours(db_session, court_id, yesterday)
    await _hours(db_session, court_id, tomorrow)

    past = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": yesterday.isoformat()}
    )
    assert past.status_code == 200 and past.json()["data"] == []
    later = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": tomorrow.isoformat()}
    )
    assert len(later.json()["data"]) == 24

    # the owner still sees every slot of the past day
    mine = await client.get(
        f"/api/v1/owner/courts/{court_id}/slots",
        headers=auth_header(owner),
        params={"date": yesterday.isoformat()},
    )
    assert len(mine.json()["data"]) == 24


async def test_today_returns_only_hours_that_have_not_started(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, court_id = await _court(client, db_session, "b")
    today = date.today()
    await _hours(db_session, court_id, today)
    noon = datetime.combine(today, time(12, 30))
    rows = await slot_service.list_public_slots(db_session, court_id, today, now=noon)
    starts = [r.start_time for r in rows]
    assert starts[0] == time(13, 0) and starts[-1] == time(23, 0) and len(starts) == 11
    # a slot that starts exactly now has started
    exact = await slot_service.list_public_slots(
        db_session, court_id, today, now=datetime.combine(today, time(13, 0))
    )
    assert exact[0].start_time == time(14, 0)
    # the very start of the day lists everything after midnight
    early = await slot_service.list_public_slots(
        db_session, court_id, today, now=datetime.combine(today, time(0, 0))
    )
    assert len(early) == 23


async def test_booking_a_past_slot_is_still_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, court_id = await _court(client, db_session, "c")
    yesterday = date.today() - timedelta(days=1)
    slots = await _hours(db_session, court_id, yesterday)
    player, _ = await make_user(client, db_session, "past-c-player@example.com", "player")
    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [str(slots[10].id)], "payment_type": "full"},
    )
    assert resp.status_code == 409, resp.text
    assert "no longer available" in resp.json()["message"]
    # and a slot of today that has started, through the price preview too
    today_slots = await _hours(db_session, court_id, date.today())
    started = next(
        s for s in today_slots if datetime.combine(s.date, s.start_time) <= datetime.now()
    )
    prev = await client.post(
        "/api/v1/bookings/preview",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [str(started.id)]},
    )
    assert prev.status_code == 409
