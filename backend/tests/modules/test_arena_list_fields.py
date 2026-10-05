"""List-card fields: avg_rating, review_count and min_price on the arena list.

min_price is the "from" price: the lowest price a slot can be quoted at. Each
available court's slot price is base_price times the lowest active multiplier,
capped at 1. A court without active rules keeps its base price.
"""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def _approved_arena(client: AsyncClient, db_session: AsyncSession, email: str):
    owner, _ = await make_user(client, db_session, email, "owner")
    created = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    arena_id = created.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-{email}")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return owner, arena_id


async def _court(client: AsyncClient, owner: dict, arena_id: str, base: str, *, available=True):
    created = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court", "sport_types": ["futsal"], "base_price": base},
    )
    court_id = created.json()["data"]["id"]
    if not available:
        await client.patch(
            f"/api/v1/owner/courts/{court_id}/availability",
            headers=auth_header(owner),
            json={"is_available": False},
        )
    return court_id


async def _rule(client: AsyncClient, owner: dict, court_id: str, multiplier: str) -> None:
    await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=auth_header(owner),
        json={
            "name": "window",
            "weekday": None,
            "start_time": "06:00:00",
            "end_time": "23:00:00",
            "price_multiplier": multiplier,
        },
    )


async def _list_item(client: AsyncClient, arena_id: str) -> dict:
    res = await client.get("/api/v1/arenas", params={"page_size": 100})
    return next(item for item in res.json()["data"]["items"] if item["id"] == arena_id)


async def test_arena_without_courts_or_reviews_has_null_price_and_zero_reviews(client, db_session):
    _, arena_id = await _approved_arena(client, db_session, "lf-empty@example.com")

    item = await _list_item(client, arena_id)

    assert item["avg_rating"] is None
    assert item["review_count"] == 0
    assert item["min_price"] is None


async def test_min_price_applies_the_discount_rule_to_the_cheapest_court(client, db_session):
    owner, arena_id = await _approved_arena(client, db_session, "lf-discount@example.com")
    discounted = await _court(client, owner, arena_id, "2000.00")
    await _rule(client, owner, discounted, "0.80")
    await _court(client, owner, arena_id, "1800.00")

    item = await _list_item(client, arena_id)

    assert Decimal(str(item["min_price"])) == Decimal("1600.00")


async def test_peak_only_rule_never_lowers_the_from_price(client, db_session):
    owner, arena_id = await _approved_arena(client, db_session, "lf-peak@example.com")
    court = await _court(client, owner, arena_id, "2000.00")
    await _rule(client, owner, court, "1.50")

    item = await _list_item(client, arena_id)

    assert Decimal(str(item["min_price"])) == Decimal("2000.00")


async def test_unavailable_court_is_ignored_for_the_from_price(client, db_session):
    owner, arena_id = await _approved_arena(client, db_session, "lf-unavail@example.com")
    await _court(client, owner, arena_id, "1000.00", available=False)
    await _court(client, owner, arena_id, "2000.00")

    item = await _list_item(client, arena_id)

    assert Decimal(str(item["min_price"])) == Decimal("2000.00")


async def test_price_filter_uses_the_same_from_price_as_the_card(client, db_session):
    owner, arena_id = await _approved_arena(client, db_session, "lf-filter@example.com")
    discounted = await _court(client, owner, arena_id, "2000.00")
    await _rule(client, owner, discounted, "0.80")

    inside = await client.get("/api/v1/arenas", params={"price_max": "1700", "page_size": 100})
    below = await client.get("/api/v1/arenas", params={"price_max": "1500", "page_size": 100})

    assert arena_id in [i["id"] for i in inside.json()["data"]["items"]]
    assert arena_id not in [i["id"] for i in below.json()["data"]["items"]]


async def test_list_uses_a_fixed_number_of_queries_regardless_of_arena_count(client, db_session):
    statements: list[str] = []

    def _count(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    async def _count_list_queries(page_size: int) -> int:
        statements.clear()
        event.listen(Engine, "before_cursor_execute", _count)
        try:
            res = await client.get("/api/v1/arenas", params={"page_size": page_size})
            assert res.status_code == 200
        finally:
            event.remove(Engine, "before_cursor_execute", _count)
        return len(statements)

    owner, first = await _approved_arena(client, db_session, "lf-count-a@example.com")
    await _court(client, owner, first, "2000.00")
    one_arena = await _count_list_queries(page_size=100)

    for n in range(3):
        owner, arena_id = await _approved_arena(client, db_session, f"lf-count-{n}@example.com")
        await _court(client, owner, arena_id, "2000.00")
    four_arenas = await _count_list_queries(page_size=100)

    assert one_arena > 0, "the statement listener did not fire"
    assert four_arenas == one_arena
