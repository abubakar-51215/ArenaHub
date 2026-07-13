"""Slot endpoints.

* ``router`` — public slot listing for a court on a given date.
* ``owner_router`` (``/owner``) — generate/list/edit/delete slots, guarded by
  ``require_role("owner")``. Ownership is derived from the parent court/arena.
"""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.slot import service
from app.modules.slot.schema import SlotGenerateRequest, SlotUpdate
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.response import success

router = APIRouter(tags=["slots"])
owner_router = APIRouter(prefix="/owner", tags=["slots-owner"])

_owner = require_role("owner")


# ---- public discovery ---------------------------------------------------


@router.get("/courts/{court_id}/slots", summary="List a court's slots for a date")
async def list_public_slots(
    court_id: uuid.UUID,
    target_date: date = Query(alias="date"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_public_slots(db, court_id, target_date)
    return success(data=rows, message="Slots retrieved.")


# ---- owner ----------------------------------------------------------------


@owner_router.post(
    "/courts/{court_id}/slots/generate",
    status_code=status.HTTP_201_CREATED,
    summary="Auto-generate slots from the arena's operating hours",
)
async def generate_slots(
    court_id: uuid.UUID,
    data: SlotGenerateRequest,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.generate_slots(db, user, court_id, data)
    return success(data=result, message="Slots generated.")


@owner_router.get("/courts/{court_id}/slots", summary="List my court's slots for a date")
async def list_owner_slots(
    court_id: uuid.UUID,
    target_date: date = Query(alias="date"),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_owner_slots(db, user, court_id, target_date)
    return success(data=rows, message="Slots retrieved.")


@owner_router.patch("/courts/{court_id}/slots/{slot_id}", summary="Edit or block a slot")
async def update_slot(
    court_id: uuid.UUID,
    slot_id: uuid.UUID,
    data: SlotUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    slot = await service.update_slot(db, user, court_id, slot_id, data)
    return success(data=slot, message="Slot updated.")


@owner_router.delete("/courts/{court_id}/slots/{slot_id}", summary="Delete a slot")
async def delete_slot(
    court_id: uuid.UUID,
    slot_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_slot(db, user, court_id, slot_id)
    return success(message="Slot deleted.")
