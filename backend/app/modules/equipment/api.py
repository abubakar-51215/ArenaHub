"""Equipment endpoints.

* ``router`` — public equipment listing for an arena (in-stock, active only).
* ``owner_router`` (``/owner``) — equipment CRUD + stock adjustment, guarded
  by ``require_role("owner")``. Ownership is derived from the parent arena.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.equipment import service
from app.modules.equipment.schema import EquipmentCreate, EquipmentUpdate, QuantityAdjust
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.response import success

router = APIRouter(tags=["equipment"])
owner_router = APIRouter(prefix="/owner", tags=["equipment-owner"])

_owner = require_role("owner")


# ---- public discovery ---------------------------------------------------


@router.get("/arenas/{arena_id}/equipment", summary="List an arena's rentable equipment")
async def list_public_equipment(
    arena_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    rows = await service.list_public_equipment(db, arena_id)
    return success(data=rows, message="Equipment retrieved.")


# ---- owner ----------------------------------------------------------------


@owner_router.post(
    "/arenas/{arena_id}/equipment",
    status_code=status.HTTP_201_CREATED,
    summary="Add equipment to an arena",
)
async def create_equipment(
    arena_id: uuid.UUID,
    data: EquipmentCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    equipment = await service.create_equipment(db, user, arena_id, data)
    return success(data=equipment, message="Equipment created.")


@owner_router.get("/arenas/{arena_id}/equipment", summary="List my arena's equipment")
async def list_owner_equipment(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_owner_equipment(db, user, arena_id)
    return success(data=rows, message="Equipment retrieved.")


@owner_router.patch("/equipment/{equipment_id}", summary="Update equipment")
async def update_equipment(
    equipment_id: uuid.UUID,
    data: EquipmentUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    equipment = await service.update_equipment(db, user, equipment_id, data)
    return success(data=equipment, message="Equipment updated.")


@owner_router.patch("/equipment/{equipment_id}/quantity", summary="Adjust total stock")
async def adjust_quantity(
    equipment_id: uuid.UUID,
    data: QuantityAdjust,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    equipment = await service.adjust_quantity(db, user, equipment_id, data)
    return success(data=equipment, message="Stock adjusted.")


@owner_router.delete("/equipment/{equipment_id}", summary="Delete equipment")
async def delete_equipment(
    equipment_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_equipment(db, user, equipment_id)
    return success(message="Equipment deleted.")
