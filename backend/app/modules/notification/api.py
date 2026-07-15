"""Notification endpoints: in-app notification center + push device
registration, all scoped to the current user."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.notification import service
from app.modules.notification.schema import DeviceTokenRegister
from app.modules.user.model import User
from app.shared.auth import get_current_user
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", summary="My notifications")
async def list_my_notifications(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_my_notifications(db, user, params)
    return success(data=data, message="Notifications retrieved.")


@router.patch("/{notification_id}/read", summary="Mark one notification read")
async def mark_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    notification = await service.mark_read(db, user, notification_id)
    return success(data=notification, message="Notification marked read.")


@router.post("/read-all", summary="Mark all notifications read")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.mark_all_read(db, user)
    return success(message="All notifications marked read.")


@router.post(
    "/devices", status_code=status.HTTP_201_CREATED, summary="Register a push device token"
)
async def register_device(
    data: DeviceTokenRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.register_device(db, user, data.token, data.platform)
    return success(message="Device registered.")


@router.delete("/devices/{token}", summary="Unregister a push device token")
async def unregister_device(
    token: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.unregister_device(db, user, token)
    return success(message="Device unregistered.")
