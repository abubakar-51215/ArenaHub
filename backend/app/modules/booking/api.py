"""Booking endpoints, all authenticated.

* ``router`` (``/bookings``) — player self-service: create, list mine, get
  one, cancel, reschedule.
* ``owner_router`` (``/owner``) — arena owner's booking view, ownership
  derived from the arena.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.booking import service
from app.modules.booking.model import BookingStatus
from app.modules.booking.schema import BookingCreateRequest, CancelRequest, RescheduleRequest
from app.modules.user.model import User
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, paginated, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/bookings", tags=["bookings"])
owner_router = APIRouter(prefix="/owner", tags=["bookings-owner"])

_owner = require_role("owner")


@router.post("", summary="Create a booking (single- or multi-slot checkout)")
async def create_booking(
    data: BookingCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.create_booking(db, user, data)
    return success(data=result, message="Booking created, awaiting payment.")


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
