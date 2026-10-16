"""GET /admin/dashboard/overview: read-only aggregates for the admin Dashboard."""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from httpx import AsyncClient
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking, BookingStatus, PaymentPlan, PaymentStatus
from app.modules.slot.model import SlotStatus, TimeSlot
from app.shared.timezone import platform_today
from tests.helpers import arena_payload, auth_header, make_admin, make_user

URL = "/api/v1/admin/dashboard/overview"


async def _arena_with_court(
    client: AsyncClient, db: AsyncSession, tag: str, city: str = "Lahore"
) -> Any:
    owner, _ = await make_user(client, db, f"ov-owner-{tag}@example.com", "owner")
    created = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name=f"Overview Arena {tag}", city=city),
    )
    arena_id = created.json()["data"]["id"]
    admin = await make_admin(client, db, f"ov-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    return admin, uuid.UUID(arena_id), uuid.UUID(court.json()["data"]["id"])


async def _booking(
    db: AsyncSession,
    *,
    player_id: uuid.UUID,
    arena_id: uuid.UUID,
    court_id: uuid.UUID,
    on: date,
    hour: int,
    amount: str = "2000.00",
    status: BookingStatus = BookingStatus.confirmed,
    created_at: datetime | None = None,
) -> None:
    slot = TimeSlot(
        court_id=court_id,
        date=on,
        start_time=time(hour),
        end_time=time(hour + 1),
        status=SlotStatus.booked,
        price=Decimal(amount),
    )
    db.add(slot)
    await db.flush()
    db.add(
        Booking(
            player_id=player_id,
            arena_id=arena_id,
            court_id=court_id,
            slot_id=slot.id,
            booking_group_id=uuid.uuid4(),
            booking_date=on,
            start_time=time(hour),
            end_time=time(hour + 1),
            total_amount=Decimal(amount),
            advance_amount=Decimal(amount),
            remaining_amount=Decimal("0"),
            payment_type=PaymentPlan.full,
            status=status,
            payment_status=PaymentStatus.completed,
            created_at=created_at or datetime.combine(on, time(hour)),
        )
    )
    await db.flush()


async def test_only_admins_can_read_the_overview(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "ov-player@example.com", "player")
    owner, _ = await make_user(client, db_session, "ov-owner@example.com", "owner")
    admin = await make_admin(client, db_session, "ov-admin@example.com")

    assert (await client.get(URL)).status_code == 401
    assert (await client.get(URL, headers=auth_header(player))).status_code == 403
    assert (await client.get(URL, headers=auth_header(owner))).status_code == 403
    assert (await client.get(URL, headers=auth_header(admin))).status_code == 200


async def test_empty_data_gives_zeros_and_no_deltas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ov-empty@example.com")

    data = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    assert data["kpis"]["bookings"]["value"] == 0
    assert data["kpis"]["bookings"]["delta_pct"] is None
    assert data["kpis"]["gross_value"]["delta_pct"] is None
    assert data["kpis"]["live_arenas"]["delta_pct"] is None
    assert len(data["bookings_by_day"]) == 30
    assert len(data["previous_bookings_by_day"]) == 30
    assert data["top_arenas"] == []
    assert data["peak_window"] is None


async def test_period_with_no_previous_data_omits_the_delta(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, arena_id, court_id = await _arena_with_court(client, db_session, "noprev")
    _, player = await make_user(client, db_session, "ov-p-noprev@example.com", "player")
    today = platform_today()
    await _booking(
        db_session, player_id=player.id, arena_id=arena_id, court_id=court_id, on=today, hour=18
    )
    await db_session.commit()

    data = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    assert data["kpis"]["bookings"]["value"] == 1
    assert data["kpis"]["bookings"]["delta_pct"] is None
    assert data["kpis"]["bookings"]["extra"] == 1  # booked today
    assert data["kpis"]["gross_value"]["value"] == 2000.0
    assert data["top_arenas"][0]["value"] == 2000.0


async def test_deltas_compare_with_the_previous_period(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, arena_id, court_id = await _arena_with_court(client, db_session, "delta")
    _, player = await make_user(client, db_session, "ov-p-delta@example.com", "player")
    today = platform_today()
    # previous period: 2 bookings; current period: 3 bookings
    for i, on in enumerate([today - timedelta(days=40), today - timedelta(days=35)]):
        await _booking(
            db_session,
            player_id=player.id,
            arena_id=arena_id,
            court_id=court_id,
            on=on,
            hour=10 + i,
        )
    for i, on in enumerate([today - timedelta(days=3), today - timedelta(days=2), today]):
        await _booking(
            db_session,
            player_id=player.id,
            arena_id=arena_id,
            court_id=court_id,
            on=on,
            hour=18 + i,
        )
    await db_session.commit()

    data = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    assert data["kpis"]["bookings"]["value"] == 3
    assert data["kpis"]["bookings"]["delta_pct"] == 50.0
    assert sum(p["value"] for p in data["previous_bookings_by_day"]) == 2
    assert data["peak_window"] == {"start_hour": 18, "end_hour": 21}


async def test_cancelled_and_rejected_bookings_add_no_count_or_value(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, arena_id, court_id = await _arena_with_court(client, db_session, "cancel")
    _, player = await make_user(client, db_session, "ov-p-cancel@example.com", "player")
    today = platform_today()
    for hour, status in [
        (9, BookingStatus.cancelled),
        (10, BookingStatus.rejected),
        (11, BookingStatus.pending_approval),
    ]:
        await _booking(
            db_session,
            player_id=player.id,
            arena_id=arena_id,
            court_id=court_id,
            on=today,
            hour=hour,
            status=status,
        )
    await db_session.commit()

    data = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    # only the pending booking counts; nothing is confirmed, so no value
    assert data["kpis"]["bookings"]["value"] == 1
    assert data["kpis"]["bookings"]["extra"] == 1
    assert sum(p["value"] for p in data["bookings_by_day"]) == 1
    assert data["by_city"] == [{"city": "Lahore", "bookings": 1, "share_pct": 100.0}]
    assert data["top_arenas"][0]["bookings"] == 1
    assert data["kpis"]["gross_value"]["value"] == 0.0


async def test_days_and_today_are_karachi_days(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """created_at is a naive wall-clock time in the database session's zone.
    With the session in UTC, 18:30 UTC is 23:30 in Karachi and 19:30 UTC is
    00:30 the next Karachi day; the overview must bucket them that way."""
    admin, arena_id, court_id = await _arena_with_court(client, db_session, "tz")
    _, player = await make_user(client, db_session, "ov-p-tz@example.com", "player")
    today = platform_today()
    yesterday = today - timedelta(days=1)
    await db_session.execute(text("SET TIME ZONE 'UTC'"))
    # 23:30 Karachi yesterday (18:30 UTC yesterday)
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=arena_id,
        court_id=court_id,
        on=yesterday,
        hour=20,
        created_at=datetime.combine(yesterday, time(18, 30)),
    )
    # 00:30 Karachi today (19:30 UTC yesterday)
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=arena_id,
        court_id=court_id,
        on=today,
        hour=21,
        created_at=datetime.combine(yesterday, time(19, 30)),
    )
    await db_session.commit()

    data = (await client.get(URL, headers=auth_header(admin))).json()["data"]
    by_day = {p["date"]: p["value"] for p in data["bookings_by_day"]}

    assert by_day[yesterday.isoformat()] == 1
    assert by_day[today.isoformat()] == 1
    assert data["kpis"]["bookings"]["extra"] == 1  # booked today, Karachi time
    assert data["period"]["end"] == today.isoformat()


async def _court(
    client: AsyncClient, owner_token: dict, arena_id: uuid.UUID, name: str
) -> uuid.UUID:
    res = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner_token),
        json={"name": name, "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    assert res.status_code < 300, res.text
    return uuid.UUID(res.json()["data"]["id"])


def _slot(court_id: uuid.UUID, on: date, status: SlotStatus) -> TimeSlot:
    return TimeSlot(
        court_id=court_id,
        date=on,
        start_time=time(18),
        end_time=time(19),
        status=status,
        price=Decimal("2000.00"),
    )


async def test_utilisation_counts_only_bookable_slots_of_live_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "ov-owner-util@example.com", "owner")
    created = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name="Overview Arena util"),
    )
    live_id = uuid.UUID(created.json()["data"]["id"])
    admin = await make_admin(client, db_session, "ov-admin-util@example.com")
    await client.post(f"/api/v1/admin/arenas/{live_id}/approve", headers=auth_header(admin))
    _, player = await make_user(client, db_session, "ov-p-util@example.com", "player")
    today = platform_today()
    court_a = await _court(client, owner, live_id, "A")
    court_b = await _court(client, owner, live_id, "B")
    # live arena at 18:00: one booked, one open -> 50%
    await _booking(
        db_session, player_id=player.id, arena_id=live_id, court_id=court_a, on=today, hour=18
    )
    db_session.add(_slot(court_b, today, SlotStatus.available))
    await db_session.commit()
    before = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    # a maintenance slot on the live arena, and a booked slot on an arena
    # still waiting for approval, must not change the percentage
    court_c = await _court(client, owner, live_id, "C")
    db_session.add(_slot(court_c, today, SlotStatus.maintenance))
    waiting = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name="Overview Arena waiting"),
    )
    waiting_id = uuid.UUID(waiting.json()["data"]["id"])
    court_w = await _court(client, owner, waiting_id, "W")
    db_session.add(_slot(court_w, today, SlotStatus.booked))
    await db_session.commit()
    after = (await client.get(URL, headers=auth_header(admin))).json()["data"]

    def at_six(data: Any) -> Any:
        return next(h for h in data["utilisation_by_hour"] if h["hour"] == 18)

    assert at_six(before) == {"hour": 18, "used": 1, "total": 2, "pct": 50.0}
    assert at_six(after) == at_six(before)


async def test_bad_city_or_range_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await make_admin(client, db_session, "ov-bad@example.com")

    bad_city = await client.get(URL, params={"city": "Atlantis"}, headers=auth_header(admin))
    bad_range = await client.get(URL, params={"range": "year"}, headers=auth_header(admin))

    assert bad_city.status_code == 422
    assert bad_range.status_code == 422


async def test_city_filter_limits_every_card(client: AsyncClient, db_session: AsyncSession) -> None:
    admin, lahore_arena, lahore_court = await _arena_with_court(client, db_session, "lhr", "Lahore")
    _, karachi_arena, karachi_court = await _arena_with_court(client, db_session, "khi", "Karachi")
    _, player = await make_user(client, db_session, "ov-p-city@example.com", "player")
    today = platform_today()
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=lahore_arena,
        court_id=lahore_court,
        on=today,
        hour=8,
    )
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=karachi_arena,
        court_id=karachi_court,
        on=today,
        hour=9,
    )
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=karachi_arena,
        court_id=karachi_court,
        on=today,
        hour=10,
    )
    await db_session.commit()

    everywhere = (await client.get(URL, headers=auth_header(admin))).json()["data"]
    karachi = (
        await client.get(URL, params={"city": "Karachi"}, headers=auth_header(admin))
    ).json()["data"]

    assert everywhere["kpis"]["bookings"]["value"] == 3
    assert {c["city"]: c["bookings"] for c in everywhere["by_city"]} == {"Karachi": 2, "Lahore": 1}
    assert karachi["kpis"]["bookings"]["value"] == 2
    assert karachi["city"] == "Karachi"
    assert [a["city"] for a in karachi["top_arenas"]] == ["Karachi"]


async def test_quarter_range_starts_on_the_first_day_of_the_quarter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ov-quarter@example.com")
    today = platform_today()

    data = (await client.get(URL, params={"range": "quarter"}, headers=auth_header(admin))).json()[
        "data"
    ]

    start = date.fromisoformat(data["period"]["start"])
    assert start.day == 1 and start.month in (1, 4, 7, 10) and start <= today
    assert len(data["bookings_by_day"]) == (today - start).days + 1


async def test_overview_uses_a_fixed_number_of_queries(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    statements: list[str] = []

    def _count(
        conn: Any, cursor: Any, statement: Any, parameters: Any, context: Any, executemany: Any
    ) -> None:
        statements.append(statement)

    async def _queries(admin: Any) -> int:
        statements.clear()
        event.listen(Engine, "before_cursor_execute", _count)
        try:
            assert (await client.get(URL, headers=auth_header(admin))).status_code == 200
        finally:
            event.remove(Engine, "before_cursor_execute", _count)
        return len(statements)

    admin, arena_id, court_id = await _arena_with_court(client, db_session, "qc")
    _, player = await make_user(client, db_session, "ov-p-qc@example.com", "player")
    await _booking(
        db_session,
        player_id=player.id,
        arena_id=arena_id,
        court_id=court_id,
        on=platform_today(),
        hour=7,
    )
    await db_session.commit()
    one = await _queries(admin)
    for h in range(8, 14):
        await _booking(
            db_session,
            player_id=player.id,
            arena_id=arena_id,
            court_id=court_id,
            on=platform_today(),
            hour=h,
        )
    await db_session.commit()
    many = await _queries(admin)

    assert one > 0
    assert many == one


async def test_queue_counts_match_the_approvals_list(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "ov-owner-queue@example.com", "owner")
    for i in range(2):
        await client.post(
            "/api/v1/owner/arenas",
            headers=auth_header(owner),
            json=arena_payload(name=f"Waiting Arena {i}"),
        )
    admin = await make_admin(client, db_session, "ov-admin-queue@example.com")

    overview = (await client.get(URL, headers=auth_header(admin))).json()["data"]
    waiting = (
        await client.get(
            "/api/v1/admin/arenas", params={"status": "pending"}, headers=auth_header(admin)
        )
    ).json()["data"]

    assert overview["queue"]["pending_arenas"] == waiting["total"] == 2
    assert overview["queue"]["oldest_waiting_at"] is not None
    assert overview["kpis"]["live_arenas"]["extra"] == 2

    # a city filter narrows the KPI card, never the queue of decisions
    elsewhere = (
        await client.get(URL, params={"city": "Karachi"}, headers=auth_header(admin))
    ).json()["data"]
    open_complaints = (
        await client.get(
            "/api/v1/admin/complaints", params={"status": "open"}, headers=auth_header(admin)
        )
    ).json()["data"]
    assert elsewhere["kpis"]["live_arenas"]["extra"] == 0
    assert elsewhere["queue"]["pending_arenas"] == 2
    assert elsewhere["queue"]["open_complaints"] == open_complaints["total"]
