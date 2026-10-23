"""The arena filters the phone's Filters sheet sends: "Must have" amenities (an arena needs ALL of
them), time of day (a free bookable slot in that part of the day on a date) and a distance, alone
and together -- and a plain search with none of them behaving exactly as before."""

from datetime import date, datetime, time, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time_of_day import BANDS, TimeOfDay, covers
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Amenity
from tests.helpers import arena_payload, auth_header, make_admin, make_user

ME = (31.5204, 74.3587)
DAY = date.today() + timedelta(days=3)
ALL_WEEK = {
    d: {"open": "08:00", "close": "23:59"}
    for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
}
MORNING_ONLY = {d: {"open": "08:00", "close": "12:00"} for d in ALL_WEEK}


async def _amenity(db: AsyncSession, name: str) -> str:
    row = Amenity(name=name)
    db.add(row)
    await db.commit()
    return str(row.id)


async def _arena(
    client: AsyncClient,
    db: AsyncSession,
    tag: str,
    *,
    amenity_ids: list[str] | None = None,
    hours: dict | None = None,
    lat: str = "31.5204",
    lon: str = "74.3587",
    city: str = "Lahore",
    with_slots: bool = True,
) -> dict[str, Any]:
    owner, _ = await make_user(client, db, f"flt-{tag}@example.com", "owner")
    h = auth_header(owner)
    made = await client.post(
        "/api/v1/owner/arenas",
        headers=h,
        json=arena_payload(
            name=f"Filter {tag}",
            amenity_ids=amenity_ids or [],
            operating_hours=hours or ALL_WEEK,
            latitude=lat,
            longitude=lon,
            city=city,
        ),
    )
    arena_id = made.json()["data"]["id"]
    admin = await make_admin(client, db, f"flt-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    if with_slots:
        await client.post(
            f"/api/v1/owner/courts/{court_id}/slots/generate",
            headers=h,
            json={"start_date": DAY.isoformat(), "end_date": DAY.isoformat()},
        )
    return {"id": arena_id, "court": court_id, "owner": owner}


async def _names(client: AsyncClient, query: str) -> list[str]:
    got = await client.get(f"/api/v1/arenas?{query}&page_size=50")
    assert got.status_code == 200, got.text
    return sorted(i["name"] for i in got.json()["data"]["items"])


# ---- the hours -------------------------------------------------------------------------------


def test_the_four_parts_of_the_day_cover_every_hour_exactly_once() -> None:
    for hour in range(24):
        owners = [band for band in TimeOfDay if covers(band, time(hour, 0))]
        assert len(owners) == 1, (hour, owners)
    assert covers(TimeOfDay.morning, time(5, 0)) and not covers(TimeOfDay.morning, time(12, 0))
    assert covers(TimeOfDay.night, time(23, 0)) and covers(TimeOfDay.night, time(2, 0))
    assert BANDS[TimeOfDay.evening] == (time(17, 0), time(21, 0))


# ---- amenities ---------------------------------------------------------------------------------


async def test_must_have_amenities_keeps_only_arenas_that_have_all_of_them(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    parking = await _amenity(db_session, "Parking")
    wifi = await _amenity(db_session, "Wi-Fi")
    await _arena(client, db_session, "both", amenity_ids=[parking, wifi], with_slots=False)
    await _arena(client, db_session, "one", amenity_ids=[parking], with_slots=False)
    await _arena(client, db_session, "none", with_slots=False)

    assert await _names(client, f"amenity_ids={parking}") == ["Filter both", "Filter one"]
    both = f"amenity_ids={parking}&amenity_ids={wifi}"
    assert await _names(client, both) == ["Filter both"]
    assert await _names(client, f"amenity_ids={wifi}") == ["Filter both"]
    # an amenity nobody has: nothing, not an error
    assert await _names(client, "amenity_ids=00000000-0000-0000-0000-000000000000") == []
    assert (await client.get("/api/v1/arenas?amenity_ids=not-an-id")).status_code == 422


async def test_the_amenity_list_offers_only_amenities_a_live_arena_has(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    empty = await client.get("/api/v1/arenas/amenities")
    assert empty.status_code == 200 and empty.json()["data"] == []
    parking = await _amenity(db_session, "Parking")
    await _amenity(db_session, "Cafe")  # nobody has it
    await _arena(client, db_session, "a", amenity_ids=[parking], with_slots=False)
    names = [a["name"] for a in (await client.get("/api/v1/arenas/amenities")).json()["data"]]
    assert names == ["Parking"]


# ---- time of day ---------------------------------------------------------------------------------


async def test_time_of_day_needs_a_free_slot_in_that_part_of_the_day(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _arena(client, db_session, "allday")
    await _arena(client, db_session, "morning", hours=MORNING_ONLY)
    on = f"date={DAY.isoformat()}"

    assert await _names(client, f"time_of_day=morning&{on}") == ["Filter allday", "Filter morning"]
    assert await _names(client, f"time_of_day=afternoon&{on}") == ["Filter allday"]
    assert await _names(client, f"time_of_day=evening&{on}") == ["Filter allday"]
    assert await _names(client, f"time_of_day=night&{on}") == ["Filter allday"]
    # nothing is generated for today: with no date the filter looks at today
    assert await _names(client, "time_of_day=morning") == []
    assert (await client.get("/api/v1/arenas?time_of_day=lunch")).status_code == 422


async def test_a_booked_up_morning_drops_the_arena_from_the_morning_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    arena = await _arena(client, db_session, "booked", hours=MORNING_ONLY)
    player, _ = await make_user(client, db_session, "flt-player@example.com", "player")
    slots = (
        await client.get(f"/api/v1/courts/{arena['court']}/slots", params={"date": DAY.isoformat()})
    ).json()["data"]
    await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": arena["court"],
            "slot_ids": [s["id"] for s in slots],
            "payment_type": "full",
        },
    )
    on = f"date={DAY.isoformat()}"
    assert await _names(client, f"time_of_day=morning&{on}") == []


async def test_a_blocked_day_or_a_started_slot_does_not_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    arena = await _arena(client, db_session, "blocked", hours=MORNING_ONLY)
    on = f"date={DAY.isoformat()}"
    assert await _names(client, f"time_of_day=morning&{on}") == ["Filter blocked"]

    # slots that already started are not offered: 11:30 on the day leaves no morning slot
    found, total = await arena_repo.search_public_arenas(
        db_session,
        q=None,
        city=None,
        sport=None,
        offset=0,
        limit=10,
        time_of_day=TimeOfDay.morning,
        day=DAY,
        now=datetime.combine(DAY, time(11, 30)),
    )
    assert total == 0 and found == []

    blocked = await client.post(
        f"/api/v1/owner/arenas/{arena['id']}/blocked-dates",
        headers=auth_header(arena["owner"]),
        json={"blocked_date": DAY.isoformat()},
    )
    assert blocked.status_code in (200, 201), blocked.text
    assert await _names(client, f"time_of_day=morning&{on}") == []


# ---- together, and unchanged without them ----


async def test_the_filters_combine_with_each_other_and_with_distance(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    parking = await _amenity(db_session, "Parking")
    await _arena(client, db_session, "all", amenity_ids=[parking])  # close, parking, all day
    await _arena(client, db_session, "farp", amenity_ids=[parking], lat="31.7500")  # 26 km away
    await _arena(client, db_session, "noparking")  # close, no parking
    await _arena(client, db_session, "morn", amenity_ids=[parking], hours=MORNING_ONLY)
    near = f"lat={ME[0]}&lon={ME[1]}"
    on = f"date={DAY.isoformat()}"

    everything = f"{near}&radius_km=10&amenity_ids={parking}&time_of_day=evening&{on}"
    assert await _names(client, everything) == ["Filter all"]
    # drop the time filter: the morning-only arena is back
    assert await _names(client, f"{near}&radius_km=10&amenity_ids={parking}") == [
        "Filter all",
        "Filter morn",
    ]
    # a wide radius brings back the far one
    assert await _names(client, f"{near}&radius_km=50&amenity_ids={parking}") == [
        "Filter all",
        "Filter farp",
        "Filter morn",
    ]
    # no radius but a distance filter value is refused as before
    assert (await client.get("/api/v1/arenas?radius_km=5")).status_code == 422
    # city still narrows
    assert await _names(client, f"city=Karachi&amenity_ids={parking}") == []


async def test_a_search_without_the_new_filters_gives_the_same_answer_as_before(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    parking = await _amenity(db_session, "Parking")
    await _arena(client, db_session, "x", amenity_ids=[parking])
    await _arena(client, db_session, "y")
    plain = await client.get("/api/v1/arenas?sort=price_asc&city=Lahore&page_size=50")
    with_empty = await client.get(
        "/api/v1/arenas?sort=price_asc&city=Lahore&page_size=50&date=" + DAY.isoformat()
    )  # a date alone changes nothing: it only matters with a time of day
    assert plain.status_code == with_empty.status_code == 200
    assert [i["id"] for i in plain.json()["data"]["items"]] == [
        i["id"] for i in with_empty.json()["data"]["items"]
    ]
    assert plain.json()["data"]["total"] == 2
