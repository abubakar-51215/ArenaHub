"""Review tests: submit (completed-booking gated, one per booking), edit
(30-day window)/delete, owner response, report/flag, rating summary."""

import uuid
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking, BookingStatus
from tests.helpers import arena_payload, auth_header, make_admin, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7
    return today + timedelta(days=days_ahead)


async def _make_bookable_court(
    client: AsyncClient, db_session: AsyncSession, owner: dict, owner_email: str
) -> tuple[str, str, date]:
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=h,
        json=arena_payload(advance_percentage=50, require_full_payment=False),
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-{owner_email}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]

    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    return arena_id, court_id, monday


async def _slots(client: AsyncClient, court_id: str, target_date: date) -> list[dict]:
    resp = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": target_date.isoformat()}
    )
    return resp.json()["data"]


async def _make_completed_booking(
    client: AsyncClient, db_session: AsyncSession, owner: dict, player: dict, owner_email: str
) -> tuple[str, str]:
    """Confirm a card-paid booking, then fast-forward it straight to
    ``completed`` (mirrors ``tests.helpers.make_admin``'s pattern of mutating
    a row directly when the API has no endpoint to express the transition —
    see review/service.py's docstring on the booking-completion gap)."""
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, owner_email)
    slots = await _slots(client, court_id, monday)
    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = created.json()["data"]["booking_group_id"]

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )

    booking_id = (await client.get("/api/v1/bookings", headers=auth_header(player))).json()["data"][
        "items"
    ][0]["id"]
    booking = await db_session.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    booking.status = BookingStatus.completed
    await db_session.commit()
    return arena_id, booking_id


async def test_submit_review_for_completed_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer1@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner1"
    )

    resp = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 5, "review_text": "Great courts."},
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert body["rating"] == 5
    assert body["reviewer_name"] == "Test User"

    summary = await client.get(f"/api/v1/arenas/{arena_id}/reviews/summary")
    assert summary.json()["data"] == {"average_rating": 5.0, "review_count": 1}


async def test_submit_review_rejects_incomplete_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner2@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer2@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "revowner2")
    slots = await _slots(client, court_id, monday)
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = booked.json()["data"]["bookings"][0]["id"]

    resp = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 4},
    )
    assert resp.status_code == 409


async def test_duplicate_review_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "revowner3@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer3@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner3"
    )

    first = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 4},
    )
    assert first.status_code == 201

    second = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 3},
    )
    assert second.status_code == 409


async def test_edit_review_updates_rating(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "revowner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer4@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner4"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 2, "review_text": "Meh."},
    )
    review_id = created.json()["data"]["id"]

    edited = await client.put(
        f"/api/v1/reviews/{review_id}",
        headers=auth_header(player),
        json={"rating": 5, "review_text": "Actually great after a rebook."},
    )
    assert edited.status_code == 200
    assert edited.json()["data"]["rating"] == 5


async def test_edit_review_forbidden_for_other_player(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner5@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer5@example.com", "player")
    other, _ = await make_user(client, db_session, "revplayer5b@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner5"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 4},
    )
    review_id = created.json()["data"]["id"]

    forbidden = await client.put(
        f"/api/v1/reviews/{review_id}", headers=auth_header(other), json={"rating": 1}
    )
    assert forbidden.status_code == 403


async def test_delete_review_by_owning_player(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner6@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer6@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner6"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 3},
    )
    review_id = created.json()["data"]["id"]

    deleted = await client.delete(f"/api/v1/reviews/{review_id}", headers=auth_header(player))
    assert deleted.status_code == 200

    summary = await client.get(f"/api/v1/arenas/{arena_id}/reviews/summary")
    assert summary.json()["data"]["review_count"] == 0


async def test_delete_review_by_admin(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "revowner7@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer7@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner7"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 3},
    )
    review_id = created.json()["data"]["id"]

    admin = await make_admin(client, db_session, "revadmin7@example.com")
    deleted = await client.delete(f"/api/v1/reviews/{review_id}", headers=auth_header(admin))
    assert deleted.status_code == 200


async def test_report_review_is_idempotent(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "revowner8@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer8@example.com", "player")
    reporter, _ = await make_user(client, db_session, "revreporter8@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner8"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 1, "review_text": "unfair spam"},
    )
    review_id = created.json()["data"]["id"]

    first = await client.post(
        f"/api/v1/reviews/{review_id}/report",
        headers=auth_header(reporter),
        json={"reason": "Fake review."},
    )
    assert first.status_code == 200

    second = await client.post(
        f"/api/v1/reviews/{review_id}/report",
        headers=auth_header(reporter),
        json={"reason": "Fake review again."},
    )
    assert second.status_code == 200


async def test_owner_can_respond_to_review_on_own_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner9@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer9@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner9"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 3, "review_text": "It was okay."},
    )
    review_id = created.json()["data"]["id"]

    responded = await client.post(
        f"/api/v1/owner/reviews/{review_id}/response",
        headers=auth_header(owner),
        json={"response_text": "Thanks for the feedback, we're improving!"},
    )
    assert responded.status_code == 200
    assert responded.json()["data"]["owner_response"] == "Thanks for the feedback, we're improving!"


async def test_owner_cannot_respond_to_other_arenas_review(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "revowner10@example.com", "owner")
    other_owner, _ = await make_user(client, db_session, "revowner10b@example.com", "owner")
    player, _ = await make_user(client, db_session, "revplayer10@example.com", "player")
    arena_id, booking_id = await _make_completed_booking(
        client, db_session, owner, player, "revowner10"
    )
    created = await client.post(
        f"/api/v1/arenas/{arena_id}/reviews",
        headers=auth_header(player),
        json={"booking_id": booking_id, "rating": 4},
    )
    review_id = created.json()["data"]["id"]

    forbidden = await client.post(
        f"/api/v1/owner/reviews/{review_id}/response",
        headers=auth_header(other_owner),
        json={"response_text": "Not my arena."},
    )
    assert forbidden.status_code == 403
