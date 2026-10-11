"""Matchmaking ("Play"): a match is played on the creator's own confirmed, upcoming booking; join/leave/cancel
rules, listing rules and the notices."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.arena.model import Arena
from app.modules.booking import repository as booking_repo
from app.modules.match import service as match_service
from app.modules.notification.model import Notification
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_payment import ALL_WEEK_HOURS, _slots


async def _arena_and_court(
    client: AsyncClient, db: AsyncSession, tag: str, days_ahead: int = 3
) -> tuple[dict, str, str, date]:
    owner, _ = await make_user(client, db, f"mowner-{tag}@example.com", "owner")
    h = auth_header(owner)
    arena_id = (
        await client.post(
            "/api/v1/owner/arenas",
            headers=h,
            json=arena_payload(operating_hours=ALL_WEEK_HOURS, require_full_payment=True),
        )
    ).json()["data"]["id"]
    admin = await make_admin(client, db, f"madmin-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court_id = (
        await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000"},
        )
    ).json()["data"]["id"]
    day = date.today() + timedelta(days=days_ahead)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": day.isoformat(), "end_date": day.isoformat()},
    )
    return owner, arena_id, court_id, day


async def _book(
    client: AsyncClient,
    player: dict,
    court_id: str,
    day: date,
    *,
    first: int = 0,
    count: int = 1,
    pay: bool = True,
) -> str:
    slots = await _slots(client, court_id, day)
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [s["id"] for s in slots[first : first + count]],
            "payment_type": "full",
        },
    )
    group_id = made.json()["data"]["booking_group_id"]
    if pay:
        init = await client.post(
            "/api/v1/payments/initiate",
            headers=auth_header(player),
            json={"booking_group_id": group_id, "payment_method": "card"},
        )
        pid = init.json()["data"]["payment"]["id"]
        await client.post(
            f"/api/v1/payments/{pid}/simulate-confirm",
            headers=auth_header(player),
            params={"success": True},
        )
    return group_id


async def _setup(client: AsyncClient, db: AsyncSession, tag: str, **kw):
    """(creator tokens, creator user, group_id, arena_id, court_id, day) with a confirmed booking."""
    _, arena_id, court_id, day = await _arena_and_court(client, db, tag)
    creator, user = await make_user(client, db, f"mcreator-{tag}@example.com", "player")
    group_id = await _book(client, creator, court_id, day, **kw)
    return creator, user, group_id, arena_id, court_id, day


async def _post(client: AsyncClient, who: dict, group_id: str, **over):
    body = {"booking_group_id": group_id, "sport": "futsal", "max_players": 2}
    body.update(over)
    return await client.post("/api/v1/matches", headers=auth_header(who), json=body)


async def _notices(db: AsyncSession, user_id, event: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.event == event)
        )
        or 0
    )


async def test_a_match_needs_my_own_confirmed_upcoming_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, user, group_id, arena_id, court_id, day = await _setup(client, db_session, "c1")
    other, _ = await make_user(client, db_session, "mother-c1@example.com", "player")

    # someone else's booking: not found
    assert (await _post(client, other, group_id)).status_code == 404
    # an unpaid booking is not confirmed
    unpaid = await _book(client, other, court_id, day, first=4, pay=False)
    assert (await _post(client, other, unpaid)).status_code == 409
    # a booking that does not exist
    assert (await _post(client, creator, str(uuid.uuid4()))).status_code == 404
    # a sport the court is not used for
    assert (await _post(client, creator, group_id, sport="cricket")).status_code == 422

    made = await _post(client, creator, group_id, max_players=4)
    assert made.status_code == 201
    body = made.json()["data"]
    assert body["booking_group_id"] == group_id and body["arena_id"] == arena_id
    assert body["court_id"] == court_id and body["match_date"] == day.isoformat()
    assert body["players_joined"] == 1 and body["status"] == "open"
    assert body["joined_by_me"] is True
    assert Decimal(body["booking_total"]) == Decimal("2000.00")
    assert len(body["participants"]) == 1


async def test_one_open_match_per_booking_and_a_new_one_after_cancelling(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, *_ = await _setup(client, db_session, "c2")
    first = await _post(client, creator, group_id)
    assert first.status_code == 201
    again = await _post(client, creator, group_id)
    assert again.status_code == 409
    assert "already have a match" in again.json()["message"]
    cancel = await client.delete(
        f"/api/v1/matches/{first.json()['data']['id']}", headers=auth_header(creator)
    )
    assert cancel.status_code == 200
    assert (await _post(client, creator, group_id)).status_code == 201


async def test_a_booking_that_already_started_cannot_have_a_match(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, user, group_id, *_ = await _setup(client, db_session, "c3")
    from app.modules.match.schema import MatchCreate

    group = await booking_repo.list_group(db_session, uuid.UUID(group_id))
    after_start = datetime.combine(group[0].booking_date, group[0].start_time) + timedelta(
        minutes=5
    )
    try:
        await match_service.create_match(
            db_session,
            user,
            MatchCreate(booking_group_id=uuid.UUID(group_id), sport="futsal", max_players=2),
            now=after_start,
        )
    except Exception as exc:  # noqa: BLE001
        assert "already started" in str(exc)
    else:
        raise AssertionError("a match was made on a booking that already started")


async def test_join_fills_up_and_the_full_match_leaves_the_list(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, *_ = await _setup(client, db_session, "j1")
    made = (await _post(client, creator, group_id, max_players=2)).json()["data"]
    match_id = made["id"]
    listed = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert any(m["id"] == match_id for m in listed.json()["data"]["items"])

    joiner, _ = await make_user(client, db_session, "mjoin-j1@example.com", "player")
    joined = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))
    assert joined.status_code == 200
    data = joined.json()["data"]
    assert data["players_joined"] == 2 and data["status"] == "full" and data["joined_by_me"] is True

    after = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert not any(m["id"] == match_id for m in after.json()["data"]["items"])

    third, _ = await make_user(client, db_session, "mthird-j1@example.com", "player")
    full = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(third))
    assert full.status_code == 409 and "full" in full.json()["message"]


async def test_joining_twice_never_doubles_and_own_cancelled_past_matches_cannot_be_joined(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, creator_user, group_id, *_ = await _setup(client, db_session, "j2")
    match_id = (await _post(client, creator, group_id, max_players=5)).json()["data"]["id"]
    joiner, joiner_user = await make_user(client, db_session, "mjoin-j2@example.com", "player")
    url = f"/api/v1/matches/{match_id}/join"

    assert (await client.post(url, headers=auth_header(joiner))).status_code == 200
    twice = await client.post(url, headers=auth_header(joiner))
    assert twice.status_code == 409 and "already joined" in twice.json()["message"]
    detail = await client.get(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    assert detail.json()["data"]["players_joined"] == 2

    own = await client.post(url, headers=auth_header(creator))
    assert own.status_code == 409 and "own match" in own.json()["message"]

    # a match that has already started cannot be joined (service level, so the clock can be moved)
    other, other_user = await make_user(client, db_session, "mjoin2-j2@example.com", "player")
    m = (await client.get(f"/api/v1/matches/{match_id}", headers=auth_header(creator))).json()[
        "data"
    ]
    started = datetime.fromisoformat(f"{m['match_date']}T{m['start_time']}") + timedelta(minutes=1)
    try:
        await match_service.join_match(db_session, other_user, uuid.UUID(match_id), now=started)
    except Exception as exc:  # noqa: BLE001
        assert "already started" in str(exc)
    else:
        raise AssertionError("joined a match that had started")

    await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    cancelled = await client.post(url, headers=auth_header(other))
    assert cancelled.status_code == 409 and "cancelled" in cancelled.json()["message"]


async def test_matches_at_a_suspended_arena_are_not_listed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, arena_id, *_ = await _setup(client, db_session, "l1")
    match_id = (await _post(client, creator, group_id)).json()["data"]["id"]
    seen = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert any(m["id"] == match_id for m in seen.json()["data"]["items"])

    arena = await db_session.get(Arena, uuid.UUID(arena_id))
    arena.suspended_at = datetime.now()
    await db_session.flush()
    gone = await client.get("/api/v1/matches", headers=auth_header(creator))
    assert not any(m["id"] == match_id for m in gone.json()["data"]["items"])


async def test_listing_filters_by_city_and_sport_and_hides_started_matches(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, *_ = await _setup(client, db_session, "l2")
    match_id = (await _post(client, creator, group_id)).json()["data"]["id"]
    ids = lambda r: [m["id"] for m in r.json()["data"]["items"]]  # noqa: E731
    h = auth_header(creator)
    assert match_id in ids(await client.get("/api/v1/matches?city=Lahore&sport=futsal", headers=h))
    assert match_id not in ids(await client.get("/api/v1/matches?city=Karachi", headers=h))
    assert match_id not in ids(await client.get("/api/v1/matches?sport=cricket", headers=h))
    later = datetime.now() + timedelta(days=10)
    listed = await match_service.list_open_matches(
        db_session,
        (await make_user(client, db_session, "mviewer-l2@example.com", "player"))[1],
        city=None,
        sport=None,
        match_date=None,
        params=type("P", (), {"offset": 0, "page_size": 20, "page": 1})(),
        now=later,
    )
    assert match_id not in [str(m.id) for m in listed["items"]]


async def test_notices_join_leave_full_and_cancel(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, creator_user, group_id, *_ = await _setup(client, db_session, "n1")
    match_id = (await _post(client, creator, group_id, max_players=3)).json()["data"]["id"]
    a, a_user = await make_user(client, db_session, "mjoin-n1a@example.com", "player")
    b, b_user = await make_user(client, db_session, "mjoin-n1b@example.com", "player")

    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(a))
    assert await _notices(db_session, creator_user.id, "match_joined") == 1
    await client.post(f"/api/v1/matches/{match_id}/leave", headers=auth_header(a))
    assert await _notices(db_session, creator_user.id, "match_left") == 1

    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(a))
    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(b))
    # filled up: everyone (creator, a, b) hears it once
    for uid in (creator_user.id, a_user.id, b_user.id):
        assert await _notices(db_session, uid, "match_full") == 1
    assert await _notices(db_session, creator_user.id, "match_joined") == 3

    await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    for uid in (a_user.id, b_user.id):
        assert await _notices(db_session, uid, "match_cancelled") == 1
    assert await _notices(db_session, creator_user.id, "match_cancelled") == 0
    # cancelling again changes nothing and sends nothing
    await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(creator))
    assert await _notices(db_session, a_user.id, "match_cancelled") == 1


async def test_creator_leaving_cancels_for_everyone_and_tells_them(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, *_ = await _setup(client, db_session, "n2")
    match_id = (await _post(client, creator, group_id, max_players=4)).json()["data"]["id"]
    a, a_user = await make_user(client, db_session, "mjoin-n2a@example.com", "player")
    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(a))
    left = await client.post(f"/api/v1/matches/{match_id}/leave", headers=auth_header(creator))
    assert left.status_code == 200
    detail = await client.get(f"/api/v1/matches/{match_id}", headers=auth_header(a))
    assert detail.json()["data"]["status"] == "cancelled"
    assert await _notices(db_session, a_user.id, "match_cancelled") == 1


async def test_cancel_only_by_creator_and_my_matches(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, _, group_id, *_ = await _setup(client, db_session, "m1")
    match_id = (await _post(client, creator, group_id, max_players=3)).json()["data"]["id"]
    joiner, _ = await make_user(client, db_session, "mjoin-m1@example.com", "player")
    await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))

    forbidden = await client.delete(f"/api/v1/matches/{match_id}", headers=auth_header(joiner))
    assert forbidden.status_code == 403

    mine = (await client.get("/api/v1/matches/mine", headers=auth_header(creator))).json()["data"]
    assert any(m["id"] == match_id for m in mine["created"])
    assert not any(m["id"] == match_id for m in mine["joined"])
    theirs = (await client.get("/api/v1/matches/mine", headers=auth_header(joiner))).json()["data"]
    assert any(m["id"] == match_id and m["joined_by_me"] for m in theirs["joined"])
    assert not any(m["id"] == match_id for m in theirs["created"])
