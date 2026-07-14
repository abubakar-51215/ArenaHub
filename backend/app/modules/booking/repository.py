"""Data access for bookings. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking, BookingStatus


async def get_booking(db: AsyncSession, booking_id: uuid.UUID) -> Booking | None:
    return await db.get(Booking, booking_id)


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
