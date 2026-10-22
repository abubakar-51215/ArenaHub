"""Booking endpoints, all authenticated.

* ``router`` (``/bookings``) — player self-service: create, list mine, get
  one, cancel, reschedule.
* ``owner_router`` (``/owner``) — arena owner's booking view, ownership
  derived from the arena.
"""

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.booking import group_service, service
from app.modules.booking.model import BookingStatus
from app.modules.booking.schema import (
    BookingCreateRequest,
    BookingGroupListItem,
    BookingPreviewRequest,
    CancelRequest,
    GroupRescheduleRequest,
    RescheduleRequest,
)
from app.modules.user.model import User
from app.shared import abuse, idempotency
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, paginated, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/bookings", tags=["bookings"])
owner_router = APIRouter(prefix="/owner", tags=["bookings-owner"])

_owner = require_role("owner")


@router.post(
    "",
    summary="Create a booking (single- or multi-slot checkout)",
    dependencies=[Depends(abuse.per_user("booking", 30, 3600))],
)
async def create_booking(
    request: Request,
    data: BookingCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    async def action() -> dict[str, Any]:
        result = await service.create_booking(db, user, data)
        return success(data=result, message="Booking created, awaiting payment.")

    return await idempotency.run_once(request, user.id, "booking", data, action)


@router.post("/preview", summary="Price a checkout without reserving anything")
async def preview_booking(
    data: BookingPreviewRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.preview_booking(db, user, data)
    return success(data=result, message="Booking priced.")


@router.get("/group/{group_id}", summary="One booking group with arena, court, money and rules")
async def get_group(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    details = await service.get_group_details(db, user, group_id)
    return success(data=details, message="Booking retrieved.")


@router.post("/group/{group_id}/release", summary="Leave checkout and give the times back")
async def release_group(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    details = await service.release_group(db, user, group_id)
    return success(data=details, message="Times released.")


@router.get("/groups", summary="My bookings as one card per booking")
async def list_my_booking_groups(
    tab: Literal["upcoming", "past", "cancelled"] = Query("upcoming"),
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows, total = await group_service.list_groups(db, user, tab, params.page, params.page_size)
    items = [BookingGroupListItem(**r) for r in rows]
    return success(data=paginated(items, total, params), message="Bookings retrieved.")


@router.get("/group/{group_id}/cancel-preview", summary="What cancelling now would refund")
async def cancel_preview(
    group_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await group_service.cancel_preview(db, user, group_id)
    return success(data=data, message="Cancel preview.")


@router.post("/group/{group_id}/cancel", summary="Cancel a whole booking, refunded once")
async def cancel_group(
    group_id: uuid.UUID,
    data: CancelRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    details = await group_service.cancel_group(db, user, group_id, data.reason)
    return success(data=details, message="Booking cancelled.")


@router.post("/group/{group_id}/reschedule-preview", summary="Price of moving a whole booking")
async def reschedule_preview(
    group_id: uuid.UUID,
    data: GroupRescheduleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    figures = await group_service.reschedule_preview(db, user, group_id, data.new_slot_ids)
    return success(data=figures, message="Reschedule preview.")


@router.post("/group/{group_id}/reschedule", summary="Move a whole booking to new times")
async def reschedule_group(
    group_id: uuid.UUID,
    data: GroupRescheduleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    details = await group_service.reschedule_group(db, user, group_id, data.new_slot_ids)
    return success(data=details, message="Booking rescheduled.")


@router.get("", summary="List my bookings")
async def list_my_bookings(
    booking_status: BookingStatus | None = Query(default=None, alias="status"),
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows, total = await service.list_my_bookings(db, user, booking_status, params)
    return success(data=paginated(rows, total, params), message="Bookings retrieved.")


@router.get("/{booking_id}", summary="Get a booking")
async def get_booking(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    booking = await service.get_booking(db, user, booking_id)
    return success(data=booking, message="Booking retrieved.")


@router.get("/{booking_id}/pass", summary="The booking pass (QR included)")
async def get_booking_pass(
    booking_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pass_ = await service.get_booking_pass(db, user, booking_id)
    return success(data=pass_, message="Pass retrieved.")


@router.post("/{booking_id}/cancel", summary="Cancel a booking")
async def cancel_booking(
    booking_id: uuid.UUID,
    data: CancelRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    booking = await service.cancel_booking(db, user, booking_id, data.reason)
    return success(data=booking, message="Booking cancelled.")


@router.post("/{booking_id}/reschedule", summary="Reschedule a booking to a different slot")
async def reschedule_booking(
    booking_id: uuid.UUID,
    data: RescheduleRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    booking = await service.reschedule_booking(db, user, booking_id, data.new_slot_id)
    return success(data=booking, message="Booking rescheduled.")


@owner_router.get("/arenas/{arena_id}/bookings", summary="List bookings for my arena")
async def list_arena_bookings(
    arena_id: uuid.UUID,
    booking_status: BookingStatus | None = Query(default=None, alias="status"),
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows, total = await service.list_arena_bookings(db, user, arena_id, booking_status, params)
    return success(data=paginated(rows, total, params), message="Bookings retrieved.")
