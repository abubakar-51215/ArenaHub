"""Data access for time slots. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid
from datetime import date, time
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking, BookingStatus
from app.modules.court.model import Court
from app.modules.slot.model import SlotStatus, TimeSlot


async def get_slot(db: AsyncSession, slot_id: uuid.UUID) -> TimeSlot | None:
    return await db.get(TimeSlot, slot_id)


async def get_slot_for_update(db: AsyncSession, slot_id: uuid.UUID) -> TimeSlot | None:
    """Row-locked, session-cache-bypassing read — used for the final
    availability check right before booking creation. ``db.get()`` would
    return the identity-mapped object loaded earlier in the same request
    (before the Redis lock was acquired) without re-querying the DB, so a
    slot another transaction booked in between could still look available.
    """
    result = await db.execute(
        select(TimeSlot)
        .where(TimeSlot.id == slot_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def list_slots(db: AsyncSession, court_id: uuid.UUID, target_date: date) -> list[TimeSlot]:
    result = await db.execute(
        select(TimeSlot)
        .where(TimeSlot.court_id == court_id, TimeSlot.date == target_date)
        .order_by(TimeSlot.start_time.asc())
    )
    return list(result.scalars().all())


async def existing_start_times(db: AsyncSession, court_id: uuid.UUID, target_date: date) -> set:
    result = await db.execute(
        select(TimeSlot.start_time).where(
            TimeSlot.court_id == court_id, TimeSlot.date == target_date
        )
    )
    return set(result.scalars().all())


async def add_slot(db: AsyncSession, slot: TimeSlot) -> TimeSlot:
    db.add(slot)
    return slot


async def count_booked_on_date(db: AsyncSession, arena_id: uuid.UUID, target_date: date) -> int:
    """How many of the arena's slots on this date have a live booking (booked or a
    payment in flight) — what blocking the whole day would knock out."""
    result = await db.execute(
        select(func.count())
        .select_from(TimeSlot)
        .join(Court, Court.id == TimeSlot.court_id)
        .where(
            Court.arena_id == arena_id,
            TimeSlot.date == target_date,
            TimeSlot.status.in_((SlotStatus.booked, SlotStatus.reserved)),
        )
    )
    return int(result.scalar() or 0)


async def occupancy_counts(
    db: AsyncSession, arena_ids: list[uuid.UUID], *, date_from: date, date_to: date
) -> tuple[int, int]:
    """(sellable slot count, booked count) across the arenas' courts in a date
    range — maintenance slots excluded from the denominator. Feeds the
    dashboard's occupancy-rate widget."""
    if not arena_ids:
        return 0, 0
    result = await db.execute(
        select(
            func.count().filter(TimeSlot.status != SlotStatus.maintenance),
            func.count().filter(TimeSlot.status == SlotStatus.booked),
        )
        .select_from(TimeSlot)
        .join(Court, Court.id == TimeSlot.court_id)
        .where(
            Court.arena_id.in_(arena_ids),
            TimeSlot.date >= date_from,
            TimeSlot.date <= date_to,
        )
    )
    total, booked = result.one()
    return int(total or 0), int(booked or 0)


async def open_counts_by_date(
    db: AsyncSession, court_id: uuid.UUID, start: date, end: date, today: date, after: time
) -> dict[date, int]:
    """date -> number of open ("available") slots, for dates that have any.
    Slots of ``today`` that have already started (start time not after
    ``after``) do not count."""
    stmt = (
        select(TimeSlot.date, func.count())
        .where(
            TimeSlot.court_id == court_id,
            TimeSlot.date >= start,
            TimeSlot.date <= end,
            TimeSlot.status == SlotStatus.available,
            or_(TimeSlot.date != today, TimeSlot.start_time > after),
        )
        .group_by(TimeSlot.date)
    )
    return {d: int(n) for d, n in (await db.execute(stmt)).all()}


async def open_today_by_court(
    db: AsyncSession, court_ids: list[uuid.UUID], today: date, after: time
) -> dict[uuid.UUID, tuple[int, Decimal]]:
    """court id -> (open slots left today, lowest price among them)."""
    if not court_ids:
        return {}
    stmt = (
        select(TimeSlot.court_id, func.count(), func.min(TimeSlot.price))
        .where(
            TimeSlot.court_id.in_(court_ids),
            TimeSlot.date == today,
            TimeSlot.status == SlotStatus.available,
            TimeSlot.start_time > after,
        )
        .group_by(TimeSlot.court_id)
    )
    return {cid: (int(n), low) for cid, n, low in (await db.execute(stmt)).all()}


async def occupancy_by_court(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: date | None,
    date_to: date | None,
) -> list[tuple[uuid.UUID, str, str, int, int]]:
    """Per-court ``(court_id, arena_name, court_name, sellable, booked)``
    over an optional date range — the owner occupancy report's row source
    (FR-O-10). Maintenance slots stay out of the denominator, matching
    ``occupancy_counts``."""
    if not arena_ids:
        return []
    from app.modules.arena.model import Arena  # local: avoid cycle at import time

    stmt = (
        select(
            Court.id,
            Arena.name,
            Court.name,
            func.count().filter(TimeSlot.status != SlotStatus.maintenance),
            func.count().filter(TimeSlot.status == SlotStatus.booked),
        )
        .select_from(TimeSlot)
        .join(Court, Court.id == TimeSlot.court_id)
        .join(Arena, Arena.id == Court.arena_id)
        .where(Court.arena_id.in_(arena_ids))
        .group_by(Court.id, Arena.name, Court.name)
        .order_by(Arena.name, Court.name)
    )
    if date_from is not None:
        stmt = stmt.where(TimeSlot.date >= date_from)
    if date_to is not None:
        stmt = stmt.where(TimeSlot.date <= date_to)
    result = await db.execute(stmt)
    return [
        (cid, an, cn, int(total or 0), int(booked or 0))
        for cid, an, cn, total, booked in result.all()
    ]


async def has_booking_history(db: AsyncSession, slot_id: uuid.UUID) -> bool:
    """Any booking row at all, even a cancelled one: the booking keeps pointing at its slot."""
    found = await db.execute(select(Booking.id).where(Booking.slot_id == slot_id).limit(1))
    return found.first() is not None


async def active_booking_ids(
    db: AsyncSession, slot_ids: list[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """slot id -> the live booking on it (cancelled and rejected ones do not count)."""
    if not slot_ids:
        return {}
    rows = await db.execute(
        select(Booking.slot_id, Booking.id).where(
            Booking.slot_id.in_(slot_ids),
            Booking.status.notin_([BookingStatus.cancelled, BookingStatus.rejected]),
        )
    )
    return {row[0]: row[1] for row in rows.all()}  # noqa: C416
