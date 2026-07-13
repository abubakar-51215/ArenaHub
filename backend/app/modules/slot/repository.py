"""Data access for time slots. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.slot.model import TimeSlot


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
