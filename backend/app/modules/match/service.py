"""Match business logic: create/join/leave/cancel, all guarded to keep the
listing consistent.

* A match is played on one of the creator's own confirmed, upcoming bookings
(``booking_group_id``); a booking has
  at most one open match. Nothing is paid in the app.
* A match is "open" until it hits ``max_players``, then "full" (it drops out of the open
list). Leaving as the
  creator cancels the match (there is no "transfer ownership").
* Joining a full, cancelled, own or past match fails with a 409 and a clear message; joining
twice never doubles.
* Notices: the creator when someone joins or leaves, everyone in the match when it is
cancelled, everyone when it
  fills up.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaCity
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import BookingStatus
from app.modules.court import repository as court_repo
from app.modules.match import repository as repo
from app.modules.match.model import Match, MatchParticipant, MatchStatus
from app.modules.match.schema import (
    MatchCreate,
    MatchDetailResponse,
    MatchResponse,
    ParticipantResponse,
)
from app.modules.user.model import User
from app.shared.notify import notify_user
from app.shared.pagination import PaginationParams, paginated

MSG_FULL = "This match is full."
MSG_CANCELLED = "This match was cancelled."
MSG_OWN = "You are already in your own match."
MSG_PAST = "This match has already started."
MSG_TWICE = "You have already joined this match."
MSG_ARENA_UNAVAILABLE = "This arena is not available right now."


def _to_response(
    match: Match,
    arena_name: str,
    city: str,
    court_name: str,
    joined: int,
    booking_total: Decimal | None,
    joined_by_me: bool,
) -> MatchResponse:
    return MatchResponse(
        id=match.id,
        creator_id=match.creator_id,
        creator_name=match.creator.full_name if match.creator else "",
        arena_id=match.arena_id,
        arena_name=arena_name,
        city=city,
        court_id=match.court_id,
        court_name=court_name,
        sport=match.sport,
        match_date=match.match_date,
        start_time=match.start_time,
        end_time=match.end_time,
        max_players=match.max_players,
        players_joined=joined,
        status=match.status,
        created_at=match.created_at,
        booking_group_id=match.booking_group_id,
        note=match.note,
        booking_total=booking_total,
        joined_by_me=joined_by_me,
    )


def _to_detail(match: Match, row: repo.Row) -> MatchDetailResponse:
    _, arena_name, city, court_name, _, total, mine = row
    base = _to_response(match, arena_name, city, court_name, len(match.participants), total, mine)
    return MatchDetailResponse(
        **base.model_dump(),
        participants=[
            ParticipantResponse(
                player_id=p.player_id,
                player_name=p.player.full_name if p.player else "",
                joined_at=p.joined_at,
            )
            for p in match.participants
        ],
    )


async def _detail(
    db: AsyncSession, match_id: uuid.UUID, viewer_id: uuid.UUID
) -> MatchDetailResponse:
    match = await repo.get_match(db, match_id)
    row = await repo.get_row(db, match_id, viewer_id)
    if match is None or row is None:
        raise NotFoundError("Match not found.")
    return _to_detail(match, row)


def _started(match: Match, now: datetime) -> bool:
    return datetime.combine(match.match_date, match.start_time) <= now


async def _notify_people(
    db: AsyncSession,
    match: Match,
    user_ids: list[uuid.UUID],
    event: str,
    arena_name: str,
    **extra: str,
) -> None:
    for uid in user_ids:
        await notify_user(
            db,
            uid,
            event,
            match_id=str(match.id),
            sport=match.sport,
            arena_name=arena_name,
            match_date=match.match_date.isoformat(),
            match_time=match.start_time.isoformat(),
            **extra,
        )


async def _arena_name(db: AsyncSession, match: Match) -> str:
    arena = await arena_repo.get_arena(db, match.arena_id)
    return arena.name if arena else "the arena"


async def create_match(
    db: AsyncSession, user: User, data: MatchCreate, now: datetime | None = None
) -> MatchDetailResponse:
    current = now or datetime.now()
    group = await booking_repo.list_group(db, data.booking_group_id)
    if not group or group[0].player_id != user.id:
        raise NotFoundError("Booking not found.")
    if any(b.status != BookingStatus.confirmed for b in group):
        raise ConflictError("Only a confirmed booking can have a match.")
    first, last = group[0], group[-1]
    start = datetime.combine(first.booking_date, first.start_time)
    if start <= current:
        raise ConflictError("This booking has already started.")
    arena = await arena_repo.get_arena(db, first.arena_id)
    if arena is None or not arena.is_live:
        raise NotFoundError("Arena not found.")
    court = await court_repo.get_court(db, first.court_id)
    if court is None:
        raise NotFoundError("Court not found for this arena.")
    if court.sport_types and data.sport not in court.sport_types:
        raise ValidationError("This court is not used for that sport.")
    if await repo.live_match_for_booking(db, data.booking_group_id) is not None:
        raise ConflictError("You already have a match on this booking.")

    match = Match(
        creator_id=user.id,
        arena_id=first.arena_id,
        court_id=first.court_id,
        booking_group_id=data.booking_group_id,
        sport=data.sport,
        note=(data.note or "").strip() or None,
        match_date=first.booking_date,
        start_time=first.start_time,
        end_time=last.end_time,
        max_players=data.max_players,
        status=MatchStatus.open,
    )
    db.add(match)
    await db.flush()
    db.add(MatchParticipant(match_id=match.id, player_id=user.id))
    await db.commit()
    return await _detail(db, match.id, user.id)


async def list_open_matches(
    db: AsyncSession,
    user: User,
    *,
    city: ArenaCity | None,
    sport: str | None,
    match_date: date | None,
    params: PaginationParams,
    now: datetime | None = None,
) -> dict:
    rows, total = await repo.list_open_matches(
        db,
        viewer_id=user.id,
        city=city,
        sport=sport,
        match_date=match_date,
        now=now or datetime.now(),
        offset=params.offset,
        limit=params.page_size,
    )
    return paginated([_to_response(*r) for r in rows], total, params)


async def get_match_detail(
    db: AsyncSession, user: User, match_id: uuid.UUID
) -> MatchDetailResponse:
    return await _detail(db, match_id, user.id)


async def list_my_matches(db: AsyncSession, user: User) -> dict:
    created_rows, joined_rows = await repo.list_my_matches(db, user.id)
    return {
        "created": [_to_response(*r) for r in created_rows],
        "joined": [_to_response(*r) for r in joined_rows],
    }


async def join_match(
    db: AsyncSession, user: User, match_id: uuid.UUID, now: datetime | None = None
) -> MatchDetailResponse:
    # Lock the Match row first — serializes concurrent joins for the same match so the capacity
    # check below
    # and the participant insert are effectively atomic (a second request blocks here until the
    # first commits).
    match = await repo.get_match_for_update(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.status == MatchStatus.cancelled:
        raise ConflictError(MSG_CANCELLED)
    # Suspending or removing an arena already cancels every match on it (the
    # admin arena-suspend/remove flow cascades to this), so the check above
    # covers the normal path with its own clear message. This is a second,
    # defensive check for an arena that stops being live some other way
    # without the match's own status catching up.
    arena = await arena_repo.get_arena(db, match.arena_id)
    if arena is None or not arena.is_live:
        raise ConflictError(MSG_ARENA_UNAVAILABLE)
    if match.creator_id == user.id:
        raise ConflictError(MSG_OWN)
    if await repo.get_participant(db, match_id, user.id) is not None:
        raise ConflictError(MSG_TWICE)
    if match.status != MatchStatus.open:
        raise ConflictError(MSG_FULL if match.status == MatchStatus.full else MSG_PAST)
    if _started(match, now or datetime.now()):
        raise ConflictError(MSG_PAST)

    current = await repo.count_participants(db, match_id)
    if current >= match.max_players:
        match.status = MatchStatus.full
        await db.commit()
        raise ConflictError(MSG_FULL)

    await repo.add_participant(db, MatchParticipant(match_id=match_id, player_id=user.id))
    arena_name = await _arena_name(db, match)
    await _notify_people(
        db, match, [match.creator_id], "match_joined", arena_name, player_name=user.full_name
    )
    if current + 1 >= match.max_players:
        match.status = MatchStatus.full
        everyone = await repo.list_participant_ids(db, match_id)
        await _notify_people(db, match, everyone, "match_full", arena_name)
    await db.commit()
    return await _detail(db, match_id, user.id)


async def follow_booking_cancelled(db: AsyncSession, booking_group_id: uuid.UUID) -> None:
    """The booking a match is played on was cancelled (by the player, or by an arena
    suspension): the match is cancelled too and everyone else in it is told once. A no-op
    when the booking has no live match. Does not commit."""
    match = await repo.live_match_for_booking(db, booking_group_id)
    if match is not None:
        await _cancel(db, match)


async def follow_booking_moved(db: AsyncSession, booking_group_id: uuid.UUID) -> None:
    """The booking was rescheduled: the match moves with it (same day and hours as the
    booking). Does not commit."""
    match = await repo.live_match_for_booking(db, booking_group_id)
    if match is None:
        return
    group = await booking_repo.list_group(db, booking_group_id)
    live = [b for b in group if b.status == BookingStatus.confirmed]
    if live:
        match.match_date = live[0].booking_date
        match.start_time = live[0].start_time
        match.end_time = live[-1].end_time


async def _cancel(db: AsyncSession, match: Match) -> None:
    """Cancel a match and tell everyone else who was in it."""
    people = [p for p in await repo.list_participant_ids(db, match.id) if p != match.creator_id]
    match.status = MatchStatus.cancelled
    await _notify_people(db, match, people, "match_cancelled", await _arena_name(db, match))


async def leave_match(db: AsyncSession, user: User, match_id: uuid.UUID) -> None:
    match = await repo.get_match(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.creator_id == user.id:
        # the creator leaving cancels it for everyone
        if match.status != MatchStatus.cancelled:
            await _cancel(db, match)
        await db.commit()
        return

    participant = await repo.get_participant(db, match_id, user.id)
    if participant is None:
        raise NotFoundError("You haven't joined this match.")
    await repo.remove_participant(db, participant)
    if match.status == MatchStatus.full:
        match.status = MatchStatus.open
    await _notify_people(
        db,
        match,
        [match.creator_id],
        "match_left",
        await _arena_name(db, match),
        player_name=user.full_name,
    )
    await db.commit()


async def cancel_match(db: AsyncSession, user: User, match_id: uuid.UUID) -> None:
    match = await repo.get_match(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.creator_id != user.id:
        raise ForbiddenError("Only the creator can cancel this match.")
    if match.status != MatchStatus.cancelled:
        await _cancel(db, match)
    await db.commit()
