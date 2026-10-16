"""Home and Search cards: smart search and recommendations return the same
list-card fields as the arena search, sort=best, and the extra sport words."""

import uuid
from datetime import datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.ai.parser import parse, places_from_areas
from app.modules.arena.model import Arena
from app.modules.review.model import Review
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_review import _make_bookable_court, _slots

CARD_FIELDS = {"avg_rating", "review_count", "min_price"}


async def _approved_arena_with_court(
    client: AsyncClient, db_session: AsyncSession, tag: str
) -> str:
    owner, _ = await make_user(client, db_session, f"sc-{tag}@example.com", "owner")
    created = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(name=f"Card {tag}", sports_offered=["futsal"]),
    )
    arena_id = created.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"sc-admin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court", "sport_types": ["futsal"], "base_price": "1500.00"},
    )
    return arena_id


async def test_smart_search_items_carry_the_list_card_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    arena_id = await _approved_arena_with_court(client, db_session, "nlp")

    res = await client.get("/api/v1/search/nlp", params={"q": "futsal"})

    item = next(i for i in res.json()["data"]["items"] if i["id"] == arena_id)
    assert item.keys() >= CARD_FIELDS
    assert item["review_count"] == 0 and item["avg_rating"] is None
    assert str(item["min_price"]).startswith("1500")


async def test_recommendations_carry_the_list_card_fields(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    arena_id = await _approved_arena_with_court(client, db_session, "rec")
    player, _ = await make_user(client, db_session, "sc-player-rec@example.com")

    res = await client.get("/api/v1/recommendations", headers=auth_header(player))

    item = next(i for i in res.json()["data"]["items"] if i["id"] == arena_id)
    assert item.keys() >= CARD_FIELDS
    assert str(item["min_price"]).startswith("1500")


def parse_search_query(text: str) -> Any:
    return parse(text, places=places_from_areas([]), now=datetime(2026, 10, 14, 12, 0))


def test_smart_search_knows_the_four_new_sports_and_keeps_tennis() -> None:
    assert parse_search_query("padel in Lahore").sport == "padel"
    assert parse_search_query("cheap squash courts").sport == "squash"
    assert parse_search_query("snooker tonight").sport == "snooker"
    assert parse_search_query("table tennis near DHA").sport == "table_tennis"
    assert parse_search_query("tennis in Karachi").sport == "tennis"
    assert parse_search_query("football arena").sport == "futsal"


async def _rated_arena(client: AsyncClient, db_session: AsyncSession, tag: str, rating: int) -> str:
    """An approved arena with one review. The review row is written directly:
    the real path needs a completed, paid booking, and card payments need a
    Stripe key that the test environment does not have."""
    owner, _ = await make_user(client, db_session, f"best-o-{tag}@example.com", "owner")
    player, player_row = await make_user(client, db_session, f"best-p-{tag}@example.com")
    arena_id, court_id, monday = await _make_bookable_court(
        client, db_session, owner, f"best-o-{tag}"
    )
    slots = await _slots(client, court_id, monday)
    await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = (await client.get("/api/v1/bookings", headers=auth_header(player))).json()["data"][
        "items"
    ][0]["id"]
    db_session.add(
        Review(
            player_id=player_row.id,
            arena_id=uuid.UUID(arena_id),
            booking_id=uuid.UUID(booking_id),
            rating=rating,
        )
    )
    await db_session.commit()
    return arena_id


async def test_sort_best_is_rating_then_review_count_then_newest(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # this test signs up eight accounts in a row, more than the sign-up budget of a minute
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 1000)
    ids = {}
    ids["a"] = await _rated_arena(client, db_session, "a", 5)
    ids["b"] = await _rated_arena(client, db_session, "b", 4)
    ids["c"] = await _approved_arena_with_court(client, db_session, "best-c")  # no reviews
    ids["d"] = await _rated_arena(client, db_session, "d", 5)
    # one transaction gives every row the same now(), so set the ages by hand
    for tag, days_old in (("a", 2), ("d", 0)):
        await db_session.execute(
            update(Arena)
            .where(Arena.id == uuid.UUID(ids[tag]))
            .values(created_at=datetime.now() - timedelta(days=days_old))
        )
    await db_session.commit()

    res = await client.get("/api/v1/arenas", params={"sort": "best", "page_size": 100})

    order = [i["id"] for i in res.json()["data"]["items"] if i["id"] in ids.values()]
    # a and d: 5 stars, one review each, so the newer (d) is first; then 4 stars; unrated last
    assert order == [ids["d"], ids["a"], ids["b"], ids["c"]]
