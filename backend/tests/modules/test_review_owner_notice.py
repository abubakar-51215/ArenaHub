"""A new review tells the arena owner once ("New review", in words), and the owner's Reviews badge
counts the reviews on their arenas that have no reply yet; a reply takes one off."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification.model import Notification
from tests.helpers import auth_header, make_user
from tests.modules.test_review import _make_completed_booking


async def _count(client: AsyncClient, owner: dict) -> int:
    r = await client.get("/api/v1/owner/reviews/unanswered-count", headers=auth_header(owner))
    assert r.status_code == 200
    return r.json()["data"]["count"]


async def test_one_new_review_notice_and_the_badge_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, owner_user = await make_user(client, db_session, "rvn-owner@example.com", "owner")
    player, _ = await make_user(client, db_session, "rvn-player@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "rvn-owner"
    )
    assert await _count(client, owner) == 0

    made = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 4, "review_text": "Good lights."},
    )
    assert made.status_code == 201
    review_id = made.json()["data"]["id"]

    rows = (
        await db_session.scalars(
            select(Notification).where(
                Notification.user_id == owner_user.id, Notification.event == "review_new"
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].title == "New review"
    assert rows[0].body == "Test User gave Downtown Futsal Arena 4 stars."
    assert await _count(client, owner) == 1

    # editing the review is not a new review: no second notice
    await client.put(
        f"/api/v1/reviews/{review_id}",
        headers=auth_header(player),
        json={"rating": 5, "review_text": "Very good lights."},
    )
    again = (
        await db_session.scalars(
            select(Notification).where(
                Notification.user_id == owner_user.id, Notification.event == "review_new"
            )
        )
    ).all()
    assert len(again) == 1

    reply = await client.post(
        f"/api/v1/owner/reviews/{review_id}/response",
        headers=auth_header(owner),
        json={"response_text": "Thank you!"},
    )
    assert reply.status_code == 200
    assert await _count(client, owner) == 0


async def test_players_cannot_read_the_owner_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "rvn-p2@example.com", "player")
    r = await client.get("/api/v1/owner/reviews/unanswered-count", headers=auth_header(player))
    assert r.status_code == 403
