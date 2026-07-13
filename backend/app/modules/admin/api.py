"""Admin verification endpoints — all guarded by ``require_role("admin")``."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.admin import service
from app.modules.admin.schema import RejectArenaRequest
from app.modules.arena.model import ArenaStatus
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/admin/arenas", tags=["admin"])

_admin = require_role("admin")


@router.get("", summary="Arena verification queue")
async def list_queue(
    status: ArenaStatus = ArenaStatus.pending,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_queue(db, status, params)
    return success(data=data, message="Verification queue retrieved.")


@router.get("/{arena_id}", summary="View any arena (admin)")
async def get_arena(
    arena_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.get_arena(db, arena_id)
    return success(data=arena, message="Arena retrieved.")


@router.post("/{arena_id}/approve", summary="Approve an arena")
async def approve_arena(
    arena_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.approve_arena(db, arena_id)
    return success(data=arena, message="Arena approved.")


@router.post("/{arena_id}/reject", summary="Reject an arena with a reason")
async def reject_arena(
    arena_id: uuid.UUID,
    data: RejectArenaRequest,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.reject_arena(db, arena_id, data.reason)
    return success(data=arena, message="Arena rejected.")
