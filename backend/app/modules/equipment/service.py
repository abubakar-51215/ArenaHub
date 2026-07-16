"""Equipment business logic: CRUD + availability, gated on ownership of the
parent arena; plus the reserve/release primitives the booking module calls
for the equipment-addon flow (docs/11 section 8).
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena, ArenaStatus
from app.modules.equipment import repository as repo
from app.modules.equipment.model import BookingEquipment, Equipment
from app.modules.equipment.schema import (
    EquipmentCreate,
    EquipmentResponse,
    EquipmentUpdate,
    QuantityAdjust,
)
from app.modules.user.model import User


async def _owned_arena(db: AsyncSession, arena_id: uuid.UUID, user: User) -> Arena:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    return arena


async def _owned_equipment(db: AsyncSession, equipment_id: uuid.UUID, user: User) -> Equipment:
    equipment = await repo.get_equipment(db, equipment_id)
    if equipment is None:
        raise NotFoundError("Equipment not found.")
    await _owned_arena(db, equipment.arena_id, user)
    return equipment


async def create_equipment(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: EquipmentCreate
) -> EquipmentResponse:
    await _owned_arena(db, arena_id, user)
    equipment = Equipment(
        arena_id=arena_id,
        name=data.name,
        description=data.description,
        rental_price=data.rental_price,
        quantity_total=data.quantity_total,
        quantity_available=data.quantity_total,
        is_active=data.is_active,
    )
    saved = await repo.add_equipment(db, equipment)
    await db.commit()
    return EquipmentResponse.model_validate(saved)


async def list_owner_equipment(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[EquipmentResponse]:
    await _owned_arena(db, arena_id, user)
    rows = await repo.list_equipment(db, arena_id)
    return [EquipmentResponse.model_validate(r) for r in rows]


async def list_public_equipment(db: AsyncSession, arena_id: uuid.UUID) -> list[EquipmentResponse]:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")
    rows = await repo.list_equipment(db, arena_id, active_only=True)
    return [EquipmentResponse.model_validate(r) for r in rows if r.quantity_available > 0]


async def update_equipment(
    db: AsyncSession, user: User, equipment_id: uuid.UUID, data: EquipmentUpdate
) -> EquipmentResponse:
    equipment = await _owned_equipment(db, equipment_id, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(equipment, field, value)
    await db.commit()
    return EquipmentResponse.model_validate(equipment)


async def adjust_quantity(
    db: AsyncSession, user: User, equipment_id: uuid.UUID, data: QuantityAdjust
) -> EquipmentResponse:
    equipment = await _owned_equipment(db, equipment_id, user)
    if data.delta < 0 and equipment.quantity_available < -data.delta:
        raise ValidationError("Cannot remove more units than are currently available (unrented).")
    equipment.quantity_total += data.delta
    equipment.quantity_available += data.delta
    await db.commit()
    return EquipmentResponse.model_validate(equipment)


async def delete_equipment(db: AsyncSession, user: User, equipment_id: uuid.UUID) -> None:
    equipment = await _owned_equipment(db, equipment_id, user)
    if equipment.quantity_available != equipment.quantity_total:
        raise ValidationError("Cannot delete equipment that is currently rented out.")
    await db.delete(equipment)
    await db.commit()


# ---- booking-module integration (docs/11 section 8) ----------------------


async def reserve_for_booking(
    db: AsyncSession,
    booking_id: uuid.UUID,
    arena_id: uuid.UUID,
    items: list[tuple[uuid.UUID, int]],
) -> Decimal:
    """Reserve equipment for a booking: decrement availability, record one
    ``BookingEquipment`` line per item, and return the total addon cost
    (added after discount, at full listed price — deviation #12).

    Raises ``ValidationError`` if any item doesn't belong to this arena, is
    inactive, or doesn't have enough units free — the caller (booking
    creation, already inside its own transaction) rolls back on any error.
    """
    if not items:
        return Decimal("0")

    equipment_ids = [item_id for item_id, _ in items]
    rows = {e.id: e for e in await repo.get_equipment_by_ids(db, equipment_ids)}

    total = Decimal("0")
    for equipment_id, quantity in items:
        equipment = rows.get(equipment_id)
        if equipment is None or equipment.arena_id != arena_id or not equipment.is_active:
            raise ValidationError(f"Equipment {equipment_id} is not available at this arena.")
        if equipment.quantity_available < quantity:
            raise ValidationError(f"Not enough '{equipment.name}' available.")
        equipment.quantity_available -= quantity
        line_total = (equipment.rental_price * quantity).quantize(Decimal("0.01"))
        await repo.add_booking_equipment(
            db,
            BookingEquipment(
                booking_id=booking_id,
                equipment_id=equipment_id,
                quantity=quantity,
                total_price=line_total,
            ),
        )
        total += line_total
    return total


async def release_for_booking(db: AsyncSession, booking_id: uuid.UUID) -> None:
    """Restore availability for every equipment line on a cancelled booking."""
    lines = await repo.list_booking_equipment(db, booking_id)
    for line in lines:
        equipment = await repo.get_equipment(db, line.equipment_id)
        if equipment is not None:
            equipment.quantity_available += line.quantity
