"""A match lives on its booking: cancelling the booking (the player, or an arena suspension)
cancels the match and tells the others once; rescheduling the booking moves the match. A
booking of several hours is one "Booking cancelled" notice."""

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.arena.model import Arena
from app.modules.notification.model import Notification
from tests.helpers import auth_header, make_admin, make_user
from tests.modules.test_match import _post, _setup
from tests.modules.test_payment import _slots

API = "/api/v1"


async def _count(db: AsyncSession, user_id, event: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.event == event)
        )
        or 0
    )


async def test_cancelling_the_booking_cancels_the_match_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, creator_user, group_id, *_ = await _setup(client, db_session, "fb1", count=2)
    match_id = (await _post(client, creator, group_id, max_players=4)).json()["data"]["id"]
    joiner, joiner_user = await make_user(client, db_session, "fb1-join@example.com", "player")
    assert (
        await client.post(f"{API}/matches/{match_id}/join", headers=auth_header(joiner))
    ).status_code == 200

    done = await client.post(
        f"{API}/bookings/group/{group_id}/cancel", headers=auth_header(creator), json={}
    )
    assert done.status_code == 200
    detail = await client.get(f"{API}/matches/{match_id}", headers=auth_header(joiner))
    assert detail.json()["data"]["status"] == "cancelled"
    assert await _count(db_session, joiner_user.id, "match_cancelled") == 1
    # a two-hour booking is one event: one "Booking cancelled"
    assert await _count(db_session, creator_user.id, "booking_cancelled") == 1
    # and it is no longer offered to anyone
    listed = await client.get(f"{API}/matches", headers=auth_header(joiner))
    assert match_id not in [m["id"] for m in listed.json()["data"]["items"]]


async def test_an_arena_suspension_cancels_the_match_and_reactivation_does_not_bring_it_back(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, arena_id, *_ = await _setup(client, db_session, "fb2")
    match_id = (await _post(client, creator, group_id, max_players=4)).json()["data"]["id"]
    joiner, joiner_user = await make_user(client, db_session, "fb2-join@example.com", "player")
    await client.post(f"{API}/matches/{match_id}/join", headers=auth_header(joiner))
    admin = await make_admin(client, db_session, "fb2-admin@example.com")
    ok = await client.post(
        f"{API}/admin/arenas/{arena_id}/suspend",
        headers=auth_header(admin),
        json={"reason": "Safety check."},
    )
    assert ok.status_code == 200
    detail = await client.get(f"{API}/matches/{match_id}", headers=auth_header(joiner))
    assert detail.json()["data"]["status"] == "cancelled"
    assert await _count(db_session, joiner_user.id, "match_cancelled") == 1
    await client.post(f"{API}/admin/arenas/{arena_id}/reactivate", headers=auth_header(admin))
    assert (await db_session.get(Arena, arena_id)) is not None
    listed = await client.get(f"{API}/matches", headers=auth_header(joiner))
    assert match_id not in [m["id"] for m in listed.json()["data"]["items"]]


async def test_rescheduling_the_booking_moves_the_match(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, _, court_id, day = await _setup(client, db_session, "fb3")
    match_id = (await _post(client, creator, group_id, max_players=4)).json()["data"]["id"]
    later = (await _slots(client, court_id, day))[-1]
    moved = await client.post(
        f"{API}/bookings/group/{group_id}/reschedule",
        headers=auth_header(creator),
        json={"new_slot_ids": [later["id"]]},
    )
    assert moved.status_code == 200, moved.text
    detail = (await client.get(f"{API}/matches/{match_id}", headers=auth_header(creator))).json()[
        "data"
    ]
    assert detail["status"] == "open"
    assert detail["match_date"] == later["date"]
    assert detail["start_time"] == later["start_time"]
