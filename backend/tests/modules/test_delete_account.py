"""Delete account: refused while the player has an upcoming or unpaid booking, allowed otherwise."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_user
from tests.modules.test_match import _arena_and_court, _book


async def test_delete_is_refused_with_an_upcoming_confirmed_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, court_id, day = await _arena_and_court(client, db_session, "d1")
    player, _ = await make_user(client, db_session, "dplayer1@example.com", "player")
    group_id = await _book(client, player, court_id, day)
    refused = await client.delete("/api/v1/users/me", headers=auth_header(player))
    assert refused.status_code == 409
    assert "upcoming or unpaid bookings" in refused.json()["message"]
    # still signed in and active
    assert (await client.get("/api/v1/users/me", headers=auth_header(player))).status_code == 200
    # after cancelling the booking the account can be deleted
    cancelled = await client.post(
        f"/api/v1/bookings/group/{group_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200
    assert (await client.delete("/api/v1/users/me", headers=auth_header(player))).status_code == 200


async def test_delete_is_refused_with_an_unpaid_booking_and_with_one_awaiting_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, court_id, day = await _arena_and_court(client, db_session, "d2")
    player, _ = await make_user(client, db_session, "dplayer2@example.com", "player")
    await _book(client, player, court_id, day, pay=False)
    refused = await client.delete("/api/v1/users/me", headers=auth_header(player))
    assert refused.status_code == 409


async def test_delete_is_allowed_with_no_bookings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "dplayer3@example.com", "player")
    assert (await client.delete("/api/v1/users/me", headers=auth_header(player))).status_code == 200
    # the session no longer works
    assert (await client.get("/api/v1/users/me", headers=auth_header(player))).status_code == 401
