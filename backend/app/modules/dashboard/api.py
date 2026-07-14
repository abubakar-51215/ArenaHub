"""Owner dashboard endpoints — all guarded by ``require_role("owner")``.

Booking approval itself lives in ``payment.api`` (``/owner/payments/{id}/
approve|reject``); this module adds the summary widgets, the cross-arena
approval queue, the calendar, and revenue widgets around it
(docs/07_ARENA_OWNER_MODULE.md sections 3, 8, 9, 11).
"""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.dashboard import service
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

owner_router = APIRouter(prefix="/owner", tags=["dashboard-owner"])

_owner = require_role("owner")


@owner_router.get("/dashboard/summary", summary="Dashboard summary widgets")
async def get_summary(
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_summary(db, user)
    return success(data=data, message="Dashboard summary retrieved.")


@owner_router.get("/dashboard/pending-approvals", summary="Booking-approval panel (all my arenas)")
async def list_pending_approvals(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_pending_approvals(db, user, params)
    return success(data=data, message="Pending approvals retrieved.")


@owner_router.get("/dashboard/revenue", summary="Revenue and earnings widgets")
async def get_revenue(
    date_from: date | None = None,
    date_to: date | None = None,
    arena_id: uuid.UUID | None = None,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_revenue(
        db, user, date_from=date_from, date_to=date_to, arena_id=arena_id
    )
    return success(data=data, message="Revenue retrieved.")


@owner_router.get("/arenas/{arena_id}/bookings/calendar", summary="Calendar view of arena bookings")
async def get_calendar(
    arena_id: uuid.UUID,
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_calendar(db, user, arena_id, date_from, date_to)
    return success(data=data, message="Calendar retrieved.")
