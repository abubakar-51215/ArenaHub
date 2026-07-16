"""Match business logic: create/join/leave/cancel, all guarded to keep the
listing consistent — a match is "open" until it hits ``max_players``, at
which point it flips to "full" and drops out of the open list. Leaving as
the creator cancels the match outright (there's no "transfer ownership" for
a lightweight social listing).
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaCity, ArenaStatus
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
from app.shared.pagination import PaginationParams, paginated


def _to_response(
    match: Match, arena_name: str, city: str, court_name: str, joined: int
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
    )


def _to_detail(match: Match, arena_name: str, city: str, court_name: str) -> MatchDetailResponse:
    base = _to_response(match, arena_name, city, court_name, len(match.participants))
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


async def create_match(db: AsyncSession, user: User, data: MatchCreate) -> MatchDetailResponse:
    arena = await arena_repo.get_arena(db, data.arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")
    court = await court_repo.get_court(db, data.court_id)
    if court is None or court.arena_id != arena.id:
        raise NotFoundError("Court not found for this arena.")
    if data.end_time <= data.start_time:
        raise ValidationError("end_time must be after start_time.")

    match = Match(
        creator_id=user.id,
        arena_id=data.arena_id,
        court_id=data.court_id,
        sport=data.sport,
        match_date=data.match_date,
        start_time=data.start_time,
        end_time=data.end_time,
        max_players=data.max_players,
        status=MatchStatus.open,
    )
    db.add(match)
    await db.flush()
    db.add(MatchParticipant(match_id=match.id, player_id=user.id))
    await db.commit()

    saved = await repo.get_match(db, match.id)
    assert saved is not None
    return _to_detail(saved, arena.name, arena.city.value, court.name)


async def list_open_matches(
    db: AsyncSession,
    *,
    city: ArenaCity | None,
    sport: str | None,
    match_date: date | None,
    params: PaginationParams,
) -> dict:
    rows, total = await repo.list_open_matches(
        db,
        city=city,
        sport=sport,
        match_date=match_date,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [_to_response(m, an, c, cn, j) for m, an, c, cn, j in rows]
    return paginated(items, total, params)


async def get_match_detail(db: AsyncSession, match_id: uuid.UUID) -> MatchDetailResponse:
    match = await repo.get_match(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    arena = await arena_repo.get_arena(db, match.arena_id)
    court = await court_repo.get_court(db, match.court_id)
    assert arena is not None and court is not None
    return _to_detail(match, arena.name, arena.city.value, court.name)


async def list_my_matches(db: AsyncSession, user: User) -> dict:
    created_rows, joined_rows = await repo.list_my_matches(db, user.id)
    return {
        "created": [_to_response(m, an, c, cn, j) for m, an, c, cn, j in created_rows],
        "joined": [_to_response(m, an, c, cn, j) for m, an, c, cn, j in joined_rows],
    }


async def join_match(db: AsyncSession, user: User, match_id: uuid.UUID) -> MatchDetailResponse:
    # Lock the Match row first — serializes concurrent joins for the same
    # match so the capacity check below and the participant insert are
    # effectively atomic (a second concurrent request blocks here until the
    # first commits, then re-reads the now-current participant count).
    match = await repo.get_match_for_update(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.status != MatchStatus.open:
        raise ConflictError("This match is no longer open.")
    if await repo.get_participant(db, match_id, user.id) is not None:
        raise ConflictError("You've already joined this match.")

    current = await repo.count_participants(db, match_id)
    if current >= match.max_players:
        match.status = MatchStatus.full
        await db.commit()
        raise ConflictError("This match just filled up.")

    await repo.add_participant(db, MatchParticipant(match_id=match_id, player_id=user.id))
    if current + 1 >= match.max_players:
        match.status = MatchStatus.full
    await db.commit()

    saved = await repo.get_match(db, match_id)
    assert saved is not None
    arena = await arena_repo.get_arena(db, saved.arena_id)
    court = await court_repo.get_court(db, saved.court_id)
    assert arena is not None and court is not None
    return _to_detail(saved, arena.name, arena.city.value, court.name)


async def leave_match(db: AsyncSession, user: User, match_id: uuid.UUID) -> None:
    match = await repo.get_match(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.creator_id == user.id:
        # A lightweight listing has no "transfer ownership" — the creator
        # leaving cancels it for everyone.
        match.status = MatchStatus.cancelled
        await db.commit()
        return

    participant = await repo.get_participant(db, match_id, user.id)
    if participant is None:
        raise NotFoundError("You haven't joined this match.")
    await repo.remove_participant(db, participant)
    if match.status == MatchStatus.full:
        match.status = MatchStatus.open
    await db.commit()


async def cancel_match(db: AsyncSession, user: User, match_id: uuid.UUID) -> None:
    match = await repo.get_match(db, match_id)
    if match is None:
        raise NotFoundError("Match not found.")
    if match.creator_id != user.id:
        raise ForbiddenError("Only the creator can cancel this match.")
    match.status = MatchStatus.cancelled
    await db.commit()
