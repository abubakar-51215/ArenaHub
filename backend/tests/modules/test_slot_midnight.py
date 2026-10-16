"""Closing at 23:59 or 24:00 means open until midnight: the 23:00 hour exists and can be booked.

Closing at 22:00 or 23:00 keeps the last hour ending at the closing time; an arena open all day
has 24 hours. The 23:00 hour ends at 23:59:59 on the same date and every display writes it as
12:00 AM. It is priced by the pricing rules like any hour, books normally, gets its 1-hour reminder
at 10 PM, and counts as finished only after 23:59:59.
"""

from datetime import date, datetime, time, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking import service as booking_service
from app.modules.booking.model import Booking
from app.modules.notification.model import Notification
from app.shared.display import time_12h
from tests.helpers import arena_payload, auth_header, make_admin, make_user

DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


async def _court(client: AsyncClient, db: AsyncSession, tag: str, open_: str, close: str) -> Any:
    owner, _ = await make_user(client, db, f"mid-{tag}@example.com", "owner")
    admin = await make_admin(client, db, f"mid-{tag}-admin@example.com")
    hours = {d: {"open": open_, "close": close} for d in DAYS}
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(operating_hours=hours, advance_percentage=100),
    )
    assert arena.status_code == 201, arena.text
    arena_id = arena.json()["data"]["id"]
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    day = date.today() + timedelta(days=3)
    made = await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": day.isoformat(), "end_date": day.isoformat()},
    )
    assert made.status_code == 201, made.text
    slots = await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": day.isoformat()})
    return owner, arena_id, court_id, day, slots.json()["data"]


@pytest.mark.parametrize(
    ("tag", "open_", "close", "count", "last"),
    [
        ("c22", "08:00", "22:00", 14, ("21:00:00", "22:00:00")),
        ("c23", "08:00", "23:00", 15, ("22:00:00", "23:00:00")),
        ("c2359", "08:00", "23:59", 16, ("23:00:00", "23:59:59")),
        ("c24", "08:00", "24:00", 16, ("23:00:00", "23:59:59")),
        ("all", "00:00", "24:00", 24, ("23:00:00", "23:59:59")),
    ],
)
async def test_the_last_hour_follows_the_closing_time(
    client: AsyncClient,
    db_session: AsyncSession,
    tag: Any,
    open_: Any,
    close: Any,
    count: Any,
    last: Any,
) -> None:
    _, _, _, _, slots = await _court(client, db_session, tag, open_, close)
    assert len(slots) == count
    assert (slots[-1]["start_time"], slots[-1]["end_time"]) == last


def test_midnight_is_written_as_12_am() -> None:
    assert time_12h(time(23, 59, 59)) == "12:00 AM"
    assert time_12h("23:59") == "12:00 AM"
    assert time_12h("24:00") == "12:00 AM"
    assert time_12h(time(23, 0)) == "11:00 PM"


async def test_the_23_00_hour_books_like_any_hour(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, day, slots = await _court(
        client, db_session, "book", "08:00", "23:59"
    )
    # a pricing rule over the late evening prices the 23:00 hour too
    await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=auth_header(owner),
        json={
            "name": "Late",
            "start_time": "22:00:00",
            "end_time": "23:59:00",
            "price_multiplier": "1.50",
        },
    )
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={
            "start_date": (day + timedelta(days=1)).isoformat(),
            "end_date": (day + timedelta(days=1)).isoformat(),
        },
    )
    next_day = (
        await client.get(
            f"/api/v1/courts/{court_id}/slots",
            params={"date": (day + timedelta(days=1)).isoformat()},
        )
    ).json()["data"]
    assert next_day[-1]["start_time"] == "23:00:00" and next_day[-1]["price"] == "3000.00"

    player, _ = await make_user(client, db_session, "mid-player@example.com")
    last = slots[-1]
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[-2]["id"], last["id"]],
            "payment_type": "full",
        },
    )
    assert made.status_code == 200, made.text
    gid = made.json()["data"]["booking_group_id"]
    group = (await client.get(f"/api/v1/bookings/group/{gid}", headers=auth_header(player))).json()[
        "data"
    ]
    assert (group["start_time"], group["end_time"]) == ("22:00:00", "23:59:59")
    # the owner's calendar holds both hours on the same date
    cal = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/bookings/calendar",
        headers=auth_header(owner),
        params={"from": day.isoformat(), "to": day.isoformat()},
    )
    assert cal.status_code == 200
    assert "23:00" in cal.text

    # confirm it, then the reminder an hour before and the "finished" sweep
    rows = (await db_session.scalars(select(Booking).where(Booking.booking_group_id == gid))).all()
    late = next(r for r in rows if r.start_time == time(23, 0))
    for r in rows:
        r.status = r.status.__class__.confirmed
    await db_session.commit()
    sent = await booking_service.send_upcoming_reminders(
        db_session, now=datetime.combine(day, time(22, 0))
    )
    assert sent >= 1
    reminder = (
        await db_session.scalars(
            select(Notification).where(Notification.event == "booking_reminder_1h")
        )
    ).all()
    assert any(n.data.get("booking_id") == str(late.id) for n in reminder)
    before_midnight = datetime.combine(day, time(23, 59))
    assert await booking_service.complete_finished_bookings(db_session, now=before_midnight) == 1
    await db_session.refresh(late)
    assert late.status.value == "confirmed"  # the 22:00 hour finished, the 23:00 hour has not
    after = datetime.combine(day + timedelta(days=1), time(0, 0, 1))
    assert await booking_service.complete_finished_bookings(db_session, now=after) == 1
    await db_session.refresh(late)
    assert late.status.value == "completed"
