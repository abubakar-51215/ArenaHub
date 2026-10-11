"""Arena search by distance: ``lat``/``lon`` with ``radius_km`` and ``sort=near`` (haversine
on the arena's
coordinates). The player's position is only a search parameter: it is never stored."""

import math

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user

ME = (31.5204, 74.3587)  # Lahore centre


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def _arena_at(
    client: AsyncClient, db: AsyncSession, tag: str, lat: str, lon: str, name: str
) -> str:
    owner, _ = await make_user(client, db, f"near-{tag}@example.com", "owner")
    made = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name=name, latitude=lat, longitude=lon),
    )
    arena_id = made.json()["data"]["id"]
    admin = await make_admin(client, db, f"near-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return arena_id


async def _three(client: AsyncClient, db: AsyncSession) -> dict[str, str]:
    # about 1.1 km, 4.4 km and 26 km from ME
    return {
        "close": await _arena_at(client, db, "a", "31.5304", "74.3587", "Near Close"),
        "mid": await _arena_at(client, db, "b", "31.5204", "74.4025", "Near Mid"),
        "far": await _arena_at(client, db, "c", "31.7500", "74.3587", "Near Far"),
    }


def _q(**extra: str | float) -> str:
    parts = {"lat": ME[0], "lon": ME[1], "q": "Near", **extra}
    return "&".join(f"{k}={v}" for k, v in parts.items())


async def test_distance_is_shown_and_sort_near_orders_by_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    ids = await _three(client, db_session)
    got = await client.get(f"/api/v1/arenas?{_q(sort='near')}")
    assert got.status_code == 200
    items = got.json()["data"]["items"]
    assert [i["id"] for i in items] == [ids["close"], ids["mid"], ids["far"]]
    for item in items:
        want = haversine(*ME, float(item["latitude"]), float(item["longitude"]))
        assert abs(item["distance_km"] - want) < 0.05
    assert items[0]["distance_km"] < items[1]["distance_km"] < items[2]["distance_km"]


async def test_radius_keeps_only_arenas_inside_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    ids = await _three(client, db_session)

    async def within(km: float) -> set[str]:
        r = await client.get(f"/api/v1/arenas?{_q(radius_km=km)}")
        return {i["id"] for i in r.json()["data"]["items"]}

    assert await within(1) == set()
    assert await within(3) == {ids["close"]}
    assert await within(5) == {ids["close"], ids["mid"]}
    assert await within(10) == {ids["close"], ids["mid"]}
    assert await within(30) == set(ids.values())
    total = (await client.get(f"/api/v1/arenas?{_q(radius_km=5)}")).json()["data"]["total"]
    assert total == 2


async def test_no_position_means_no_distance_and_sort_near_needs_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _three(client, db_session)
    plain = await client.get("/api/v1/arenas?q=Near")
    assert plain.status_code == 200
    assert all(i["distance_km"] is None for i in plain.json()["data"]["items"])
    assert (await client.get("/api/v1/arenas?q=Near&sort=near")).status_code == 422
    assert (await client.get("/api/v1/arenas?q=Near&radius_km=5")).status_code == 422
    assert (await client.get("/api/v1/arenas?q=Near&lat=31.5")).status_code == 422
    assert (await client.get("/api/v1/arenas?lat=95&lon=74&sort=near")).status_code == 422
    assert (await client.get(f"/api/v1/arenas?{_q(radius_km=0)}")).status_code == 422


async def test_other_filters_still_apply_with_a_radius(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    ids = await _three(client, db_session)
    r = await client.get(f"/api/v1/arenas?{_q(radius_km=30, city='Karachi')}")
    assert r.json()["data"]["items"] == []
    r = await client.get(f"/api/v1/arenas?{_q(radius_km=30, city='Lahore', sort='near')}")
    assert [i["id"] for i in r.json()["data"]["items"]][0] == ids["close"]
