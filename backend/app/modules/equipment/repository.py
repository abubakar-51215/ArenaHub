"""Data access for equipment and booking-equipment lines.

Repository layer: queries and inserts only. Callers own the transaction.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.equipment.model import BookingEquipment, Equipment


async def get_equipment(db: AsyncSession, equipment_id: uuid.UUID) -> Equipment | None:
    return await db.get(Equipment, equipment_id)


async def add_equipment(db: AsyncSession, equipment: Equipment) -> Equipment:
    db.add(equipment)
    await db.flush()
    return equipment


async def list_equipment(
    db: AsyncSession, arena_id: uuid.UUID, *, active_only: bool = False
) -> list[Equipment]:
    stmt = select(Equipment).where(Equipment.arena_id == arena_id)
    if active_only:
        stmt = stmt.where(Equipment.is_active.is_(True))
    stmt = stmt.order_by(Equipment.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_equipment_by_ids(db: AsyncSession, ids: list[uuid.UUID]) -> list[Equipment]:
    if not ids:
        return []
    result = await db.execute(select(Equipment).where(Equipment.id.in_(ids)))
    return list(result.scalars().all())


async def add_booking_equipment(db: AsyncSession, line: BookingEquipment) -> BookingEquipment:
    db.add(line)
    await db.flush()
    return line


async def list_booking_equipment(db: AsyncSession, booking_id: uuid.UUID) -> list[BookingEquipment]:
    result = await db.execute(
        select(BookingEquipment).where(BookingEquipment.booking_id == booking_id)
    )
    return list(result.scalars().all())
