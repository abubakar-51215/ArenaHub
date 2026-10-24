"""Admin user and owner detail: a read-only, paged booking history. A player's own bookings; an
owner's arenas and the bookings received with the booker's first name only. Admin only."""

from typing import Any

from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.user.model import User, UserRole
from tests.helpers import auth_header, make_admin, make_user
from tests.modules.test_review import _make_bookable_court, _slots


async def _book_three(
    client: AsyncClient, db: AsyncSession, tag: str
) -> tuple[dict, User, dict, User, dict]:
    owner, owner_row = await make_user(client, db, f"bh-owner-{tag}@example.com", "owner")
    player, player_row = await make_user(client, db, f"bh-player-{tag}@example.com", "player")
    _, court_id, day = await _make_bookable_court(client, db, owner, f"bh-{tag}")
    slots = await _slots(client, court_id, day)
    for slot in slots[:3]:
        made = await client.post(
            "/api/v1/bookings",
            headers=auth_header(player),
            json={"court_id": court_id, "slot_ids": [slot["id"]], "payment_type": "full"},
        )
        assert made.status_code in (200, 201), made.text
    admin = await make_admin(client, db, f"bh-admin-{tag}@example.com")
    return owner, owner_row, player, player_row, admin


async def _history(client: AsyncClient, who: dict, user: User | str, **params: Any) -> Response:
    uid = user if isinstance(user, str) else str(user.id)
    return await client.get(f"/api/v1/admin/users/{uid}/bookings", headers=who, params=params)


async def test_a_players_history_is_paged_newest_day_and_latest_hour_first(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, _, player, admin = await _book_three(client, db_session, "player")
    h = auth_header(admin)
    first = (await _history(client, h, player, page=1, page_size=2)).json()["data"]
    assert first["role"] == "player" and first["arenas"] == []
    assert first["total"] == 3 and len(first["items"]) == 2 and first["page"] == 1
    second = (await _history(client, h, player, page=2, page_size=2)).json()["data"]
    assert len(second["items"]) == 1
    starts = [i["start_time"] for i in first["items"] + second["items"]]
    assert starts == sorted(starts, reverse=True)
    row = first["items"][0]
    assert set(row) == {
        "id",
        "booking_code",
        "booking_date",
        "start_time",
        "end_time",
        "arena_name",
        "court_name",
        "status",
        "total_amount",
        "player_first_name",
    }
    assert row["player_first_name"] is None  # a player's own history needs no booker
    assert row["booking_code"].startswith("AHB-") and row["court_name"] == "Court A"
    beyond = (await _history(client, h, player, page=9, page_size=2)).json()["data"]
    assert beyond["items"] == [] and beyond["total"] == 3


async def test_an_owners_history_has_their_arenas_and_the_first_name_of_each_booker(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner, _, _, admin = await _book_three(client, db_session, "owner")
    got = (await _history(client, auth_header(admin), owner)).json()["data"]
    assert got["role"] == "owner" and got["total"] == 3
    assert len(got["arenas"]) == 1 and got["arenas"][0]["name"]
    assert {i["player_first_name"] for i in got["items"]} == {"Test"}  # "Test User" -> first name
    flat = str(got["items"])
    assert "@example.com" not in flat and "User" not in flat  # nothing beyond the columns


async def test_empty_history_and_an_unknown_or_admin_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, quiet = await make_user(client, db_session, "bh-quiet@example.com", "player")
    _, quiet_owner = await make_user(client, db_session, "bh-quiet-o@example.com", "owner")
    admin = await make_admin(client, db_session, "bh-admin-empty@example.com")
    h = auth_header(admin)
    none = (await _history(client, h, quiet)).json()["data"]
    assert none["items"] == [] and none["total"] == 0 and none["arenas"] == []
    none_o = (await _history(client, h, quiet_owner)).json()["data"]
    assert none_o["items"] == [] and none_o["total"] == 0 and none_o["arenas"] == []
    _, other_admin_row = await make_user(client, db_session, "bh-admin-other@example.com", "owner")
    other_admin_row.role = UserRole.admin
    await db_session.commit()
    admin_history = (await _history(client, h, other_admin_row)).json()["data"]
    assert admin_history["items"] == [] and admin_history["role"] == "admin"
    missing = await _history(client, h, "00000000-0000-0000-0000-000000000000")
    assert missing.status_code == 404


async def test_only_an_admin_can_read_a_booking_history(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_tokens, owner, player_tokens, player, _ = await _book_three(client, db_session, "who")
    stranger, _ = await make_user(client, db_session, "bh-stranger@example.com", "player")
    for who in (auth_header(stranger), auth_header(owner_tokens), auth_header(player_tokens), {}):
        for target in (player, owner):
            got = await _history(client, who, target)
            assert got.status_code in (401, 403), (target.role, got.text)
