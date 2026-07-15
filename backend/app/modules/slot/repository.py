"""Data access for time slots. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.court.model import Court
from app.modules.slot.model import SlotStatus, TimeSlot


async def get_slot(db: AsyncSession, slot_id: uuid.UUID) -> TimeSlot | None:
    return await db.get(TimeSlot, slot_id)


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
