"""The booking pass: the QR carries a random pass token with no relationship to the
booking id, verifiable only by looking it up server-side; the pass route answers only
for the player who owns a confirmed booking, never for a pending or cancelled one, and
never for someone else's booking (same answer as not-found)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking import repository as booking_repo
from app.modules.booking.model import Booking
from app.shared.qr import PASS_TOKEN_BYTES, make_pass_token
from tests.helpers import auth_header, make_user
from tests.modules.test_group_cancel import _paid_group


def test_pass_token_is_random_and_long_enough_to_be_unguessable() -> None:
    a, b = make_pass_token(), make_pass_token()
    assert a != b
    assert len(a) == PASS_TOKEN_BYTES * 2  # hex-encoded
    assert len(bytes.fromhex(a)) == PASS_TOKEN_BYTES


async def test_a_pass_token_is_only_verifiable_by_looking_it_up(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """The point of the design: there is no way to go from a token back to a booking
    except a database lookup — a token nobody issued finds nothing."""
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "passlk")
    booking_id = group["bookings"][0]["id"]
    booking = await db_session.get(Booking, booking_id)
    assert booking is not None and booking.pass_token is not None

    found = await booking_repo.get_booking_by_pass_token(db_session, booking.pass_token)
    assert found is not None and str(found.id) == booking_id

    forged = await booking_repo.get_booking_by_pass_token(db_session, make_pass_token())
    assert forged is None


async def test_pass_route_returns_arena_court_date_time_status_and_qr(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "pass1")
    booking_id = group["bookings"][0]["id"]

    got = await client.get(f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(player))
    assert got.status_code == 200, got.text
    data = got.json()["data"]
    assert data["status"] == "confirmed"
    assert data["arena_name"] and data["court_name"]
    assert data["booking_date"] == monday.isoformat()
    assert data["qr_code_url"]
    # the QR's payload (checked separately) never names the booking id in plain text;
    # the response itself is the display data, not the QR's own encoded bytes.


async def test_pass_qr_is_generated_inline_never_a_public_file(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A saved QR file (even at an unguessable path) is a public address reachable by
    anyone who ever gets the link. The pass route must build the image fresh from the
    token on each call instead of handing back a stored file's URL."""
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "passqr")
    booking_id = group["bookings"][0]["id"]

    got = await client.get(f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(player))
    assert got.status_code == 200, got.text
    qr = got.json()["data"]["qr_code_url"]
    assert qr.startswith("data:image/png;base64,")
    assert "/uploads/" not in qr and "cloudinary" not in qr

    booking = await db_session.get(Booking, booking_id)
    assert booking is not None
    assert booking.qr_code_url is None  # confirmation no longer writes a public file
    assert booking.pass_token is not None


async def test_pass_route_shows_the_whole_groups_time_range(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A two-hour group is one pass: the time shown spans the earliest start to the
    latest end across the group, not just the one booking row the id happens to name."""
    player, group, payment, court_id, monday = await _paid_group(
        client, db_session, "passrange", slot_count=2
    )
    bookings = sorted(group["bookings"], key=lambda b: b["start_time"])
    assert bookings[0]["start_time"] != bookings[-1]["end_time"]  # genuinely two slots

    for booking_id in (bookings[0]["id"], bookings[-1]["id"]):
        got = await client.get(f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(player))
        assert got.status_code == 200, got.text
        data = got.json()["data"]
        assert data["start_time"] == bookings[0]["start_time"]
        assert data["end_time"] == bookings[-1]["end_time"]


async def test_pass_route_refuses_a_pending_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.modules.test_review import _make_bookable_court, _slots

    owner, _ = await make_user(client, db_session, "pass2-owner@example.com", "owner")
    player, _ = await make_user(client, db_session, "pass2-player@example.com")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "pass2")
    slots = await _slots(client, court_id, monday)
    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]  # never paid: still pending

    refused = await client.get(f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(player))
    assert refused.status_code == 422


async def test_pass_route_refuses_a_cancelled_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(
        client, db_session, "pass3", slot_count=1
    )
    booking_id = group["bookings"][0]["id"]
    await client.post(
        f"/api/v1/bookings/group/{group['booking_group_id']}/cancel",
        headers=auth_header(player),
        json={},
    )

    refused = await client.get(f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(player))
    assert refused.status_code == 422


async def test_pass_route_never_shows_another_players_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, group, payment, court_id, monday = await _paid_group(client, db_session, "pass4")
    booking_id = group["bookings"][0]["id"]
    someone_else, _ = await make_user(client, db_session, "pass4-other@example.com")

    hidden = await client.get(
        f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(someone_else)
    )
    assert hidden.status_code == 404


async def test_pass_route_is_player_only(client: AsyncClient, db_session: AsyncSession) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "pass5")
    booking_id = group["bookings"][0]["id"]
    another_owner, _ = await make_user(client, db_session, "pass5-otherowner@example.com", "owner")
    # even an owner (just not through the player's own pass route) is refused
    refused = await client.get(
        f"/api/v1/bookings/{booking_id}/pass", headers=auth_header(another_owner)
    )
    assert refused.status_code == 404
