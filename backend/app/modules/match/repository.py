"""Data access for matches + participants. Repository layer: queries and
inserts only, no business rules. Callers own the transaction.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.modules.arena.model import Arena, ArenaCity
from app.modules.booking.model import Booking
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


async def get_match_for_update(db: AsyncSession, match_id: uuid.UUID) -> Match | None:
    """Locks the Match row (``SELECT ... FOR UPDATE``) so a concurrent join
    can't read the same pre-insert participant count before either commits —
    closes the race where two simultaneous joins both pass the capacity
    check and push the match past ``max_players``."""
    result = await db.execute(select(Match).where(Match.id == match_id).with_for_update())
    return result.scalar_one_or_none()


Row = tuple[Match, str, str, str, int, "Decimal | None", bool]


def _extras(viewer_id: uuid.UUID) -> Any:
    """Subqueries every match row needs: players joined, the booking's total price, did the
    viewer join."""
    participant = aliased(MatchParticipant)
    joined = (
        select(func.count(participant.id)).where(participant.match_id == Match.id).scalar_subquery()
    )
    total = (
        select(func.sum(Booking.total_amount))
        .where(Booking.booking_group_id == Match.booking_group_id)
        .scalar_subquery()
    )
    mine_alias = aliased(MatchParticipant)
    mine = (
        select(func.count(mine_alias.id))
        .where(mine_alias.match_id == Match.id, mine_alias.player_id == viewer_id)
        .scalar_subquery()
    )
    return joined, total, mine


def _rows(result: Any) -> list[Row]:
    return [
        (match, arena_name, city_val.value, court_name, joined, total, bool(mine))
        for match, arena_name, city_val, court_name, joined, total, mine in result.all()
    ]


def _base(viewer_id: uuid.UUID) -> Select:
    joined, total, mine = _extras(viewer_id)
    return (
        select(
            Match,
            Arena.name,
            Arena.city,
            Court.name,
            joined.label("joined"),
            total.label("booking_total"),
            mine.label("mine"),
        )
        .join(Arena, Arena.id == Match.arena_id)
        .join(Court, Court.id == Match.court_id)
        .options(selectinload(Match.creator))
    )


async def list_open_matches(
    db: AsyncSession,
    *,
    viewer_id: uuid.UUID,
    city: ArenaCity | None,
    sport: str | None,
    match_date: date | None,
    now: datetime,
    offset: int,
    limit: int,
) -> tuple[list[Row], int]:
    """Open matches that have not started, at arenas that are live (a suspended arena's
    matches are not listed),
    soonest first."""
    base = (
        _base(viewer_id)
        .where(Match.status == MatchStatus.open, *Arena.live_conditions())
        .where(
            (Match.match_date > now.date())
            | ((Match.match_date == now.date()) & (Match.start_time > now.time()))
        )
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
    return _rows(result), total


async def list_my_matches(db: AsyncSession, player_id: uuid.UUID) -> tuple[list[Row], list[Row]]:
    """(created, joined) — joined excludes matches this player created."""
    created_stmt = (
        _base(player_id)
        .where(Match.creator_id == player_id)
        .order_by(Match.match_date.desc(), Match.start_time.desc())
    )
    joined_stmt = (
        _base(player_id)
        .join(MatchParticipant, MatchParticipant.match_id == Match.id)
        .where(MatchParticipant.player_id == player_id, Match.creator_id != player_id)
        .order_by(Match.match_date.desc(), Match.start_time.desc())
    )
    return _rows(await db.execute(created_stmt)), _rows(await db.execute(joined_stmt))


async def get_row(db: AsyncSession, match_id: uuid.UUID, viewer_id: uuid.UUID) -> Row | None:
    result = await db.execute(_base(viewer_id).where(Match.id == match_id))
    rows = _rows(result)
    return rows[0] if rows else None


async def live_match_for_booking(db: AsyncSession, booking_group_id: uuid.UUID) -> Match | None:
    result = await db.execute(
        select(Match).where(
            Match.booking_group_id == booking_group_id,
            Match.status.in_([MatchStatus.open, MatchStatus.full]),
        )
    )
    return result.scalar_one_or_none()


async def list_participant_ids(db: AsyncSession, match_id: uuid.UUID) -> list[uuid.UUID]:
    result = await db.execute(
        select(MatchParticipant.player_id).where(MatchParticipant.match_id == match_id)
    )
    return list(result.scalars().all())


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
