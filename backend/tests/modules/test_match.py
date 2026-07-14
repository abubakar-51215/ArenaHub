"""Match ("Play") creation, listing, join/leave/cancel lifecycle tests."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def _setup_arena_court(
    client: AsyncClient, db: AsyncSession, owner_email: str, admin_email: str
) -> tuple[dict, str, str]:
    """Register an owner, create + approve an arena, add a court. Returns
    (owner tokens, arena_id, court_id)."""
    owner, _ = await make_user(client, db, owner_email, "owner")
    h = auth_header(owner)
    arena_id = (await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())).json()[
        "data"
    ]["id"]
    court_id = (
        await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000"},
        )
    ).json()["data"]["id"]

    admin = await make_admin(client, db, admin_email)
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return owner, arena_id, court_id


def _match_payload(arena_id: str, court_id: str, **overrides: str | int) -> dict:
    payload: dict = {
        "arena_id": arena_id,
        "court_id": court_id,
        "sport": "futsal",
        "match_date": "2026-08-01",
        "start_time": "18:00:00",
        "end_time": "19:00:00",
        "max_players": 2,
    }
    payload.update(overrides)
    return payload


async def test_create_match_requires_approved_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "mowner1@example.com", "owner")
    h = auth_header(owner)
    arena_id = (await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())).json()[
        "data"
    ]["id"]
    court_id = (
        await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000"},
        )
    ).json()["data"]["id"]

    player, _ = await make_user(client, db_session, "mplayer1@example.com", "player")
    resp = await client.post(
        "/api/v1/matches",
        headers=auth_header(player),
        json=_match_payload(arena_id, court_id),
    )
    assert resp.status_code == 404


async def test_create_match_rejects_bad_time_range(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, arena_id, court_id = await _setup_arena_court(
        client, db_session, "mowner2@example.com", "madmin2@example.com"
    )
    player, _ = await make_user(client, db_session, "mplayer2@example.com", "player")
    resp = await client.post(
        "/api/v1/matches",
        headers=auth_header(player),
        json=_match_payload(arena_id, court_id, start_time="19:00:00", end_time="18:00:00"),
    )
    assert resp.status_code == 422


async def test_create_and_join_match_fills_up(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, arena_id, court_id = await _setup_arena_court(
        client, db_session, "mowner3@example.com", "madmin3@example.com"
    )
    creator, _ = await make_user(client, db_session, "mcreator3@example.com", "player")
    created = await client.post(
        "/api/v1/matches",
        headers=auth_header(creator),
        json=_match_payload(arena_id, court_id, max_players=2),
    )
    assert created.status_code == 201
    body = created.json()["data"]
    match_id = body["id"]
    assert body["players_joined"] == 1
    assert body["status"] == "open"
    assert len(body["participants"]) == 1

    listed = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert listed.status_code == 200
    assert any(m["id"] == match_id for m in listed.json()["data"]["items"])

    joiner, _ = await make_user(client, db_session, "mjoiner3@example.com", "player")
    joined = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))
    assert joined.status_code == 200
    joined_body = joined.json()["data"]
    assert joined_body["players_joined"] == 2
    assert joined_body["status"] == "full"

    # Match is full → drops out of the open listing.
    listed_after = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert not any(m["id"] == match_id for m in listed_after.json()["data"]["items"])

    # A third player can't join a full match.
    third, _ = await make_user(client, db_session, "mthird3@example.com", "player")
    rejected = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(third))
    assert rejected.status_code == 409

    # Joining twice is rejected.
    twice = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))
    assert twice.status_code == 409


async def test_leave_match_reopens_slot_and_creator_leaving_cancels(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, arena_id, court_id = await _setup_arena_court(
        client, db_session, "mowner4@example.com", "madmin4@example.com"
    )
    creator, _ = await make_user(client, db_session, "mcreator4@example.com", "player")
    match_id = (
        await client.post(
            "/api/v1/matches",
            headers=auth_header(creator),
            json=_match_payload(arena_id, court_id, max_players=2),
        )
    ).json()["data"]["id"]

    joiner, _ = await make_user(client, db_session, "mjoiner4@example.com", "player")
    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))

    left = await client.post(f"/api/v1/matches/{match_id}/leave", headers=auth_header(joiner))
    assert left.status_code == 200
    detail = (await client.get(f"/api/v1/matches/{match_id}", headers=auth_header(creator))).json()[
        "data"
    ]
    assert detail["status"] == "open"
    assert detail["players_joined"] == 1

    # Creator leaving cancels the match outright.
    creator_left = await client.post(
        f"/api/v1/matches/{match_id}/leave", headers=auth_header(creator)
    )
    assert creator_left.status_code == 200
    cancelled = (
        await client.get(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    ).json()["data"]
    assert cancelled["status"] == "cancelled"


async def test_cancel_match_only_by_creator(client: AsyncClient, db_session: AsyncSession) -> None:
    _, arena_id, court_id = await _setup_arena_court(
        client, db_session, "mowner5@example.com", "madmin5@example.com"
    )
    creator, _ = await make_user(client, db_session, "mcreator5@example.com", "player")
    match_id = (
        await client.post(
            "/api/v1/matches",
            headers=auth_header(creator),
            json=_match_payload(arena_id, court_id),
        )
    ).json()["data"]["id"]

    other, _ = await make_user(client, db_session, "mother5@example.com", "player")
    forbidden = await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(other))
    assert forbidden.status_code == 403

    cancelled = await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    assert cancelled.status_code == 200


async def test_my_matches_separates_created_and_joined(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, arena_id, court_id = await _setup_arena_court(
        client, db_session, "mowner6@example.com", "madmin6@example.com"
    )
    creator, _ = await make_user(client, db_session, "mcreator6@example.com", "player")
    match_id = (
        await client.post(
            "/api/v1/matches",
            headers=auth_header(creator),
            json=_match_payload(arena_id, court_id, max_players=3),
        )
    ).json()["data"]["id"]

    joiner, _ = await make_user(client, db_session, "mjoiner6@example.com", "player")
    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))

    creator_mine = (await client.get("/api/v1/matches/mine", headers=auth_header(creator))).json()[
        "data"
    ]
    assert any(m["id"] == match_id for m in creator_mine["created"])
    assert not any(m["id"] == match_id for m in creator_mine["joined"])

    joiner_mine = (await client.get("/api/v1/matches/mine", headers=auth_header(joiner))).json()[
        "data"
    ]
    assert any(m["id"] == match_id for m in joiner_mine["joined"])
    assert not any(m["id"] == match_id for m in joiner_mine["created"])
