"""Data access for bookings. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, Integer, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.arena.model import Arena
from app.modules.booking.model import Booking, BookingStatus
from app.modules.court.model import Court
from app.modules.user.model import User


async def get_booking(db: AsyncSession, booking_id: uuid.UUID) -> Booking | None:
    return await db.get(Booking, booking_id)


async def get_booking_for_update(db: AsyncSession, booking_id: uuid.UUID) -> Booking | None:
    """Row-locked, session-cache-bypassing read — used right before a status
    transition (cancel/reschedule) so a concurrent request against the same
    booking can't also pass its own stale status check and race the mutation."""
    result = await db.execute(
        select(Booking)
        .where(Booking.id == booking_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def add_booking(db: AsyncSession, booking: Booking) -> Booking:
    db.add(booking)
    await db.flush()
    return booking


async def list_group(db: AsyncSession, booking_group_id: uuid.UUID) -> list[Booking]:
    result = await db.execute(
        select(Booking)
        .where(Booking.booking_group_id == booking_group_id)
        .order_by(Booking.start_time.asc())
    )
    return list(result.scalars().all())


async def list_group_for_update(db: AsyncSession, booking_group_id: uuid.UUID) -> list[Booking]:
    result = await db.execute(
        select(Booking)
        .where(Booking.booking_group_id == booking_group_id)
        .order_by(Booking.start_time.asc())
        .with_for_update()
    )
    return list(result.scalars().all())


async def list_player_bookings(
    db: AsyncSession,
    player_id: uuid.UUID,
    *,
    status: BookingStatus | None,
    offset: int,
    limit: int,
) -> tuple[list[Booking], int]:
    base = select(Booking).where(Booking.player_id == player_id)
    if status is not None:
        base = base.where(Booking.status == status)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Booking.created_at.desc()).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def list_arena_bookings(
    db: AsyncSession,
    arena_id: uuid.UUID,
    *,
    status: BookingStatus | None,
    offset: int,
    limit: int,
) -> tuple[list[Booking], int]:
    base = select(Booking).where(Booking.arena_id == arena_id)
    if status is not None:
        base = base.where(Booking.status == status)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Booking.created_at.desc()).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def list_stale_pending_payment(db: AsyncSession, cutoff: datetime) -> list[Booking]:
    result = await db.execute(
        select(Booking).where(
            Booking.status == BookingStatus.pending_payment, Booking.created_at < cutoff
        )
    )
    return list(result.scalars().all())


async def list_stale_pending_payment_for_update(
    db: AsyncSession, cutoff: datetime
) -> list[Booking]:
    result = await db.execute(
        select(Booking)
        .where(Booking.status == BookingStatus.pending_payment, Booking.created_at < cutoff)
        .with_for_update()
    )
    return list(result.scalars().all())


async def list_confirmed_bookings_on_dates(db: AsyncSession, dates: list[date]) -> list[Booking]:
    """Confirmed bookings falling on any of ``dates`` — callers narrow to an
    exact time window in Python (booking_date/start_time are separate
    columns, so a precise datetime-range filter isn't a single SQL clause)."""
    if not dates:
        return []
    result = await db.execute(
        select(Booking).where(
            Booking.status == BookingStatus.confirmed, Booking.booking_date.in_(dates)
        )
    )
    return list(result.scalars().all())


async def list_confirmed_on_or_before(db: AsyncSession, cutoff_date: date) -> list[Booking]:
    """Confirmed bookings whose ``booking_date`` is on or before ``cutoff_date``
    — callers narrow to an exact end-of-slot cutoff in Python (booking_date/
    end_time are separate columns, so a precise datetime comparison isn't a
    single SQL clause). Used by the completion sweep."""
    result = await db.execute(
        select(Booking).where(
            Booking.status == BookingStatus.confirmed, Booking.booking_date <= cutoff_date
        )
    )
    return list(result.scalars().all())


# ---- owner dashboard ------------------------------------------------------


async def count_by_status_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID], status: BookingStatus
) -> int:
    if not arena_ids:
        return 0
    return (
        await db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(Booking.arena_id.in_(arena_ids), Booking.status == status)
        )
        or 0
    )


async def count_on_date_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID], target_date: date
) -> int:
    if not arena_ids:
        return 0
    return (
        await db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(Booking.arena_id.in_(arena_ids), Booking.booking_date == target_date)
        )
        or 0
    )


async def count_in_range_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID], start: date, end: date
) -> int:
    if not arena_ids:
        return 0
    return (
        await db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.arena_id.in_(arena_ids),
                Booking.booking_date >= start,
                Booking.booking_date <= end,
            )
        )
        or 0
    )


async def list_arena_bookings_in_range(
    db: AsyncSession, arena_id: uuid.UUID, start: date, end: date
) -> list[Booking]:
    """Every booking on one arena within a date range, for a calendar view
    (all statuses — the color-coding by status is a frontend concern)."""
    result = await db.execute(
        select(Booking)
        .where(
            Booking.arena_id == arena_id,
            Booking.booking_date >= start,
            Booking.booking_date <= end,
        )
        .order_by(Booking.booking_date.asc(), Booking.start_time.asc())
    )
    return list(result.scalars().all())


async def list_pending_approval_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID], *, offset: int, limit: int
) -> tuple[list[Booking], int]:
    """Cross-arena pending_approval queue for an owner's booking-approval
    panel — unlike ``list_arena_bookings``, this isn't scoped to one arena."""
    if not arena_ids:
        return [], 0
    base = select(Booking).where(
        Booking.arena_id.in_(arena_ids), Booking.status == BookingStatus.pending_approval
    )
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Booking.created_at.asc()).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def bookings_by_hour(
    db: AsyncSession, arena_ids: list[uuid.UUID], start: date, end: date
) -> list[tuple[int, int]]:
    """(start hour, booking count) pairs in a date range — cancelled/rejected
    excluded. Feeds the dashboard's bookings-by-time-of-day chart."""
    if not arena_ids:
        return []
    hour = func.cast(func.extract("hour", Booking.start_time), Integer).label("hour")
    result = await db.execute(
        select(hour, func.count())
        .where(
            Booking.arena_id.in_(arena_ids),
            Booking.booking_date >= start,
            Booking.booking_date <= end,
            Booking.status.notin_([BookingStatus.cancelled, BookingStatus.rejected]),
        )
        .group_by(hour)
        .order_by(hour)
    )
    return [(h, count) for h, count in result.all()]


async def list_recent_bookings_with_names(
    db: AsyncSession, arena_ids: list[uuid.UUID], *, limit: int
) -> list[tuple[Booking, str, str]]:
    """Latest bookings across arenas joined to (court name, arena name)."""
    if not arena_ids:
        return []
    result = await db.execute(
        select(Booking, Court.name, Arena.name)
        .join(Court, Court.id == Booking.court_id)
        .join(Arena, Arena.id == Booking.arena_id)
        .where(Booking.arena_id.in_(arena_ids))
        .order_by(Booking.created_at.desc())
        .limit(limit)
    )
    return [(booking, court_name, arena_name) for booking, court_name, arena_name in result.all()]


async def list_owner_bookings_with_names(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    court_id: uuid.UUID | None,
    status: BookingStatus | None,
    date_from: date | None,
    date_to: date | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Booking, str, str, str]], int]:
    """Cross-arena booking rows joined to (court name, arena name, player
    name) with the booking-management screen's filters. Callers narrow
    ``arena_ids`` first for the arena filter."""
    if not arena_ids:
        return [], 0
    conditions: list[ColumnElement[bool]] = [Booking.arena_id.in_(arena_ids)]
    if court_id is not None:
        conditions.append(Booking.court_id == court_id)
    if status is not None:
        conditions.append(Booking.status == status)
    if date_from is not None:
        conditions.append(Booking.booking_date >= date_from)
    if date_to is not None:
        conditions.append(Booking.booking_date <= date_to)

    total = (await db.scalar(select(func.count()).select_from(Booking).where(*conditions))) or 0
    result = await db.execute(
        select(Booking, Court.name, Arena.name, User.full_name)
        .join(Court, Court.id == Booking.court_id)
        .join(Arena, Arena.id == Booking.arena_id)
        .join(User, User.id == Booking.player_id)
        .where(*conditions)
        .order_by(Booking.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = [
        (booking, court_name, arena_name, player_name)
        for booking, court_name, arena_name, player_name in result.all()
    ]
    return rows, total


async def sum_pending_settlement_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID]
) -> Decimal:
    """Advance payments not yet collected on-site: the remaining balance on
    confirmed-or-completed advance-plan bookings."""
    if not arena_ids:
        return Decimal("0")
    total = await db.scalar(
        select(func.coalesce(func.sum(Booking.remaining_amount), 0)).where(
            Booking.arena_id.in_(arena_ids),
            Booking.status.in_([BookingStatus.confirmed, BookingStatus.completed]),
            Booking.remaining_amount > 0,
        )
    )
    return Decimal(total or 0)


async def busiest_hour_by_court(
    db: AsyncSession, arena_ids: list[uuid.UUID], *, start: date | None, end: date | None
) -> dict[uuid.UUID, tuple[int, int]]:
    """Per-court ``{court_id: (hour, booking_count)}`` for the busiest start
    hour in a range (cancelled/rejected excluded) — the "peak usage" column
    on the owner occupancy report."""
    if not arena_ids:
        return {}
    hour = func.cast(func.extract("hour", Booking.start_time), Integer)
    stmt = (
        select(Booking.court_id, hour, func.count())
        .where(
            Booking.arena_id.in_(arena_ids),
            Booking.status.notin_([BookingStatus.cancelled, BookingStatus.rejected]),
        )
        .group_by(Booking.court_id, hour)
    )
    if start is not None:
        stmt = stmt.where(Booking.booking_date >= start)
    if end is not None:
        stmt = stmt.where(Booking.booking_date <= end)
    result = await db.execute(stmt)
    best: dict[uuid.UUID, tuple[int, int]] = {}
    for court_id, h, count in result.all():
        if court_id not in best or count > best[court_id][1]:
            best[court_id] = (int(h), int(count))
    return best
