"""AI module tests: NLP search parsing + recommendations, including the
cold-start case (brand-new player, no booking history, no preferences) —
previously untested end to end."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def _make_approved_arena(
    client: AsyncClient, db_session: AsyncSession, owner_email: str, **overrides: object
) -> str:
    owner, _ = await make_user(client, db_session, f"{owner_email}@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload(**overrides))
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-{owner_email}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return arena_id


async def test_recommendations_for_brand_new_player_do_not_error(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Cold start: no bookings, no preferred_sports/preferred_locations —
    every scoring term must fall back to a neutral default rather than
    crashing on empty history."""
    await _make_approved_arena(client, db_session, "aiowner1", name="AI Cold Start Arena")
    player, _ = await make_user(client, db_session, "aiplayer1@example.com")

    resp = await client.get("/api/v1/recommendations", headers=auth_header(player))
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    assert any(a["name"] == "AI Cold Start Arena" for a in items)


async def test_recommendations_respect_city_filter(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _make_approved_arena(
        client, db_session, "aiowner2", name="AI Lahore Arena", city="Lahore"
    )
    await _make_approved_arena(
        client, db_session, "aiowner3", name="AI Karachi Arena", city="Karachi"
    )
    player, _ = await make_user(client, db_session, "aiplayer2@example.com")

    resp = await client.get(
        "/api/v1/recommendations", headers=auth_header(player), params={"city": "Lahore"}
    )
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()["data"]["items"]]
    assert "AI Lahore Arena" in names
    assert "AI Karachi Arena" not in names


async def test_recommendations_require_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/recommendations")
    assert resp.status_code == 401


async def test_nlp_search_parses_sport_and_city(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _make_approved_arena(
        client,
        db_session,
        "aiowner4",
        name="AI Futsal Lahore",
        city="Lahore",
        sports_offered=["futsal"],
    )
    resp = await client.get("/api/v1/search/nlp", params={"q": "futsal in Lahore"})
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["parsed"]["sport"] == "futsal"
    assert body["parsed"]["city"] == "Lahore"
    assert any(a["name"] == "AI Futsal Lahore" for a in body["items"])
