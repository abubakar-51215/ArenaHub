"""Data access for matches + participants. Repository layer: queries and
inserts only, no business rules. Callers own the transaction.
"""

import uuid
from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.modules.arena.model import Arena, ArenaCity
from app.modules.court.model import Court
from app.modules.match.model import Match, MatchParticipant, MatchStatus
from app.modules.user.model import User


def _with_participants(stmt: Select) -> Select:
    return stmt.options(
        selectinload(Match.creator),
        selectinload(Match.participants).selectinload(MatchParticipant.player),
    )


async def get_match(db: AsyncSession, match_id: uuid.UUID) -> Match | None:
    # populate_existing: callers re-fetch after mutating participants within
    # the same session, and the identity map would otherwise hand back the
    # stale, already-loaded ``participants`` collection instead of reissuing
    # the selectinload.
    result = await db.execute(
        _with_participants(select(Match).where(Match.id == match_id)).execution_options(
            populate_existing=True
        )
    )
    return result.scalar_one_or_none()


async def list_open_matches(
    db: AsyncSession,
    *,
    city: ArenaCity | None,
    sport: str | None,
    match_date: date | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Match, str, str, str, int]], int]:
    """Open matches joined to (arena name, city, court name, players-joined
    count), soonest first."""
    participant_count = (
        select(func.count(MatchParticipant.id))
        .where(MatchParticipant.match_id == Match.id)
        .scalar_subquery()
    )
    base = (
        select(Match, Arena.name, Arena.city, Court.name, participant_count.label("joined"))
        .join(Arena, Arena.id == Match.arena_id)
        .join(Court, Court.id == Match.court_id)
        .where(Match.status == MatchStatus.open)
        .options(selectinload(Match.creator))
    )
    if city:
        base = base.where(Arena.city == city)
    if sport:
        base = base.where(Match.sport == sport)
    if match_date:
        base = base.where(Match.match_date == match_date)

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        base.order_by(Match.match_date.asc(), Match.start_time.asc()).offset(offset).limit(limit)
    )
    return [
        (match, arena_name, city_val.value, court_name, joined)
        for match, arena_name, city_val, court_name, joined in result.all()
    ], total


async def list_my_matches(
    db: AsyncSession, player_id: uuid.UUID
) -> tuple[list[tuple[Match, str, str, str, int]], list[tuple[Match, str, str, str, int]]]:
    """(created, joined) — joined excludes matches this player created."""
    # Aliased so the count subquery's own FROM doesn't get auto-correlated
    # away by joined_stmt's separate, unaliased join on MatchParticipant.
    participant = aliased(MatchParticipant)
    participant_count = (
        select(func.count(participant.id)).where(participant.match_id == Match.id).scalar_subquery()
    )

    created_stmt = (
        select(Match, Arena.name, Arena.city, Court.name, participant_count.label("joined"))
        .join(Arena, Arena.id == Match.arena_id)
        .join(Court, Court.id == Match.court_id)
        .where(Match.creator_id == player_id)
        .order_by(Match.match_date.desc())
        .options(selectinload(Match.creator))
    )
    joined_stmt = (
        select(Match, Arena.name, Arena.city, Court.name, participant_count.label("joined"))
        .join(Arena, Arena.id == Match.arena_id)
        .join(Court, Court.id == Match.court_id)
        .join(MatchParticipant, MatchParticipant.match_id == Match.id)
        .where(MatchParticipant.player_id == player_id, Match.creator_id != player_id)
        .order_by(Match.match_date.desc())
        .options(selectinload(Match.creator))
    )

    created = (await db.execute(created_stmt)).all()
    joined = (await db.execute(joined_stmt)).all()
    return (
        [(m, an, c.value, cn, j) for m, an, c, cn, j in created],
        [(m, an, c.value, cn, j) for m, an, c, cn, j in joined],
    )


async def get_participant(
    db: AsyncSession, match_id: uuid.UUID, player_id: uuid.UUID
) -> MatchParticipant | None:
    result = await db.execute(
        select(MatchParticipant).where(
            MatchParticipant.match_id == match_id, MatchParticipant.player_id == player_id
        )
    )
    return result.scalar_one_or_none()


async def count_participants(db: AsyncSession, match_id: uuid.UUID) -> int:
    return (
        await db.scalar(
            select(func.count(MatchParticipant.id)).where(MatchParticipant.match_id == match_id)
        )
        or 0
    )


async def add_participant(db: AsyncSession, participant: MatchParticipant) -> MatchParticipant:
    db.add(participant)
    await db.flush()
    return participant


async def remove_participant(db: AsyncSession, participant: MatchParticipant) -> None:
    await db.delete(participant)


async def get_user_name(db: AsyncSession, user_id: uuid.UUID) -> str:
    user = await db.get(User, user_id)
    return user.full_name if user else ""
