"""Admin endpoints — all guarded by ``require_role("admin")``.

* ``router`` — arena verification (``/admin/arenas``), user management
  (``/admin/users``), platform-wide booking/payment monitoring
  (``/admin/bookings``, ``/admin/payments``), the dashboard
  (``/admin/dashboard``), and the audit log (``/admin/audit-logs``).
"""

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.admin import service
from app.modules.admin.schema import (
    PlatformSettingsRequest,
    RejectArenaRequest,
    SuspendUserRequest,
)
from app.modules.arena.model import ArenaStatus
from app.modules.booking.model import BookingStatus
from app.modules.payment.model import PaymentMethod
from app.modules.payment.model import PaymentStatus as PayStatus
from app.modules.user.model import User, UserRole
from app.shared.auth import require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/admin", tags=["admin"])

_admin = require_role("admin")


# ---- dashboard --------------------------------------------------


@router.get("/dashboard", summary="Platform-wide dashboard metrics")
async def get_dashboard(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_dashboard_metrics(db)
    return success(data=data, message="Dashboard metrics retrieved.")


# ---- arena verification --------------------------------------------------


@router.get("/arenas", summary="Arena verification queue")
async def list_queue(
    status: ArenaStatus = ArenaStatus.pending,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_queue(db, status, params)
    return success(data=data, message="Verification queue retrieved.")


@router.get("/arenas/{arena_id}", summary="View any arena (admin)")
async def get_arena(
    arena_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.get_arena(db, arena_id)
    return success(data=arena, message="Arena retrieved.")


@router.post("/arenas/{arena_id}/approve", summary="Approve an arena")
async def approve_arena(
    arena_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.approve_arena(db, user, arena_id)
    return success(data=arena, message="Arena approved.")


@router.post("/arenas/{arena_id}/reject", summary="Reject an arena with a reason")
async def reject_arena(
    arena_id: uuid.UUID,
    data: RejectArenaRequest,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.reject_arena(db, user, arena_id, data.reason)
    return success(data=arena, message="Arena rejected.")


# ---- user management --------------------------------------------------


@router.get("/users", summary="List all users with filters")
async def list_users(
    role: UserRole | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_users(
        db, role=role, is_active=is_active, search=search, params=params
    )
    return success(data=data, message="Users retrieved.")


@router.get("/users/{user_id}", summary="Get user details")
async def get_user(
    user_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_user_detail(db, user_id)
    return success(data=data, message="User retrieved.")


@router.patch("/users/{user_id}/suspend", summary="Suspend a user account")
async def suspend_user(
    user_id: uuid.UUID,
    data: SuspendUserRequest,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.suspend_user(db, user, user_id, data.reason)
    return success(data=result, message="Account suspended.")


@router.patch("/users/{user_id}/reactivate", summary="Reactivate a suspended account")
async def reactivate_user(
    user_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.reactivate_user(db, user, user_id)
    return success(data=result, message="Account reactivated.")


@router.delete("/users/{user_id}", summary="Delete a user account")
async def delete_user(
    user_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_user(db, user, user_id)
    return success(message="User deleted.")


# ---- platform-wide monitoring --------------------------------------------------


@router.get("/bookings", summary="Platform-wide booking list")
async def list_bookings(
    status: BookingStatus | None = None,
    arena_id: uuid.UUID | None = None,
    player_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_bookings(
        db,
        status=status,
        arena_id=arena_id,
        player_id=player_id,
        date_from=date_from,
        date_to=date_to,
        params=params,
    )
    return success(data=data, message="Bookings retrieved.")


@router.get("/payments", summary="Platform-wide payment/transaction list")
async def list_payments(
    status: PayStatus | None = None,
    method: PaymentMethod | None = None,
    arena_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_payments(
        db,
        status=status,
        method=method,
        arena_id=arena_id,
        date_from=date_from,
        date_to=date_to,
        params=params,
    )
    return success(data=data, message="Payments retrieved.")


# ---- audit log --------------------------------------------------


@router.get("/audit-logs", summary="Browse the admin action audit log")
async def list_audit_logs(
    action: str | None = None,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_audit_logs(db, action=action, params=params)
    return success(data=data, message="Audit log retrieved.")


# ---- platform settings --------------------------------------------------


@router.get("/settings", summary="Get platform settings")
async def get_settings(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_platform_settings(db)
    return success(data=data, message="Settings retrieved.")


@router.put("/settings", summary="Update platform settings")
async def update_settings(
    data: PlatformSettingsRequest,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.update_platform_settings(db, user, data)
    return success(data=result, message="Settings updated.")
