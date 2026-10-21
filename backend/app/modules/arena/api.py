"""Arena endpoints.

Two routers:
* ``router`` (``/arenas``) — public discovery (approved + active only).
* ``owner_router`` (``/owner/arenas``) — owner management, guarded by
  ``require_role("owner")`` (the Track A integration contract).
"""

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceUnavailableError, ValidationError
from app.database.session import get_db
from app.modules.arena import service
from app.modules.arena.model import ArenaCity
from app.modules.arena.schema import (
    ArenaBankDetailsCreate,
    ArenaBankDetailsUpdate,
    ArenaCreate,
    ArenaUpdate,
    BankDetailsVerifyRequest,
    BlockedDateCreate,
    DiscountCodeCreate,
    DiscountCodeUpdate,
)
from app.modules.user.model import User
from app.shared import abuse, codes
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/arenas", tags=["arenas"])
owner_router = APIRouter(prefix="/owner/arenas", tags=["arenas-owner"])

_owner = require_role("owner")


# ---- public discovery ---------------------------------------------------


@router.get("", summary="Search approved arenas")
async def search_arenas(
    q: str | None = Query(None, max_length=100),
    city: ArenaCity | None = None,
    sport: str | None = Query(None, max_length=50),
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    sort: str = Query("newest", max_length=30),
    lat: float | None = Query(default=None, ge=-90, le=90),
    lon: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float | None = Query(default=None, gt=0, le=500),
    params: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # The player's position is only a search parameter: it is never stored (or logged) by the
    # server.
    if (lat is None) != (lon is None):
        raise ValidationError("Send both lat and lon, or neither.")
    if (sort == "near" or radius_km is not None) and lat is None:
        raise ValidationError("Searching by distance needs lat and lon.")
    near = (lat, lon) if lat is not None and lon is not None else None
    data = await service.search_arenas(
        db,
        q=q,
        city=city,
        sport=sport,
        price_min=price_min,
        price_max=price_max,
        sort=sort,
        near=near,
        radius_km=radius_km,
        params=params,
    )
    return success(data=data, message="Arenas retrieved.")


@router.get("/trending", summary="Arenas trending by recent booking volume")
async def get_trending_arenas(
    days: int = Query(7, ge=1, le=90),
    city: ArenaCity | None = None,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    items = await service.get_trending_arenas(db, days=days, city=city, limit=limit)
    return success(data={"items": items}, message="Trending arenas retrieved.")


@router.get("/liked", summary="My liked arenas")
async def list_liked_arenas(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_liked_arenas(db, user, params)
    return success(data=data, message="Liked arenas retrieved.")


@router.get("/{arena_id}", summary="Get a public arena")
async def get_arena(arena_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    data = await service.get_public_arena(db, arena_id)
    return success(data=data, message="Arena retrieved.")


@router.post("/{arena_id}/like", summary="Add an arena to my liked list")
async def like_arena(
    arena_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.like_arena(db, user, arena_id)
    return success(message="Arena liked.")


@router.delete("/{arena_id}/like", summary="Remove an arena from my liked list")
async def unlike_arena(
    arena_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.unlike_arena(db, user, arena_id)
    return success(message="Arena unliked.")


@router.get(
    "/{arena_id}/bank-details",
    summary="Get the arena's bank-transfer details (checkout, bank_transfer method)",
)
async def get_bank_details(
    arena_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.get_bank_details_for_checkout(db, user, arena_id)
    return success(data=data, message="Bank details retrieved.")


# ---- owner management ----------------------------------------------------


@owner_router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new arena",
    dependencies=[Depends(abuse.per_user("arena", 10, 86400))],
)
async def create_arena(
    data: ArenaCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.create_arena(db, user, data)
    return success(data=arena, message="Arena submitted for verification.")


@owner_router.get("", summary="List my arenas")
async def list_my_arenas(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_owner_arenas(db, user, params)
    return success(data=data, message="Arenas retrieved.")


@owner_router.get("/{arena_id}", summary="Get one of my arenas")
async def get_my_arena(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.get_owned_arena(db, user, arena_id)
    return success(data=arena, message="Arena retrieved.")


@owner_router.patch("/{arena_id}", summary="Update one of my arenas")
async def update_arena(
    arena_id: uuid.UUID,
    data: ArenaUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.update_arena(db, user, arena_id, data)
    return success(data=arena, message="Arena updated.")


@owner_router.delete("/{arena_id}", summary="Deactivate one of my arenas")
async def deactivate_arena(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.deactivate_arena(db, user, arena_id)
    return success(message="Arena deactivated.")


@owner_router.post("/{arena_id}/resubmit", summary="Resubmit a rejected arena")
async def resubmit_arena(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    arena = await service.resubmit_for_verification(db, user, arena_id)
    return success(data=arena, message="Arena resubmitted for verification.")


# ---- blocked dates ------------------------------------------------------


@owner_router.post(
    "/{arena_id}/blocked-dates",
    status_code=status.HTTP_201_CREATED,
    summary="Block a date",
)
async def block_date(
    arena_id: uuid.UUID,
    data: BlockedDateCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    blocked = await service.add_blocked_date(db, user, arena_id, data)
    return success(data=blocked, message="Date blocked.")


@owner_router.get("/{arena_id}/blocked-dates", summary="List blocked dates")
async def list_blocked_dates(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_blocked_dates(db, user, arena_id)
    return success(data=rows, message="Blocked dates retrieved.")


@owner_router.delete("/{arena_id}/blocked-dates/{blocked_id}", summary="Unblock a date")
async def unblock_date(
    arena_id: uuid.UUID,
    blocked_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.remove_blocked_date(db, user, arena_id, blocked_id)
    return success(message="Date unblocked.")


# ---- discount codes -----------------------------------------------------


@owner_router.post(
    "/{arena_id}/discounts",
    status_code=status.HTTP_201_CREATED,
    summary="Create a discount code",
)
async def create_discount(
    arena_id: uuid.UUID,
    data: DiscountCodeCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    discount = await service.create_discount(db, user, arena_id, data)
    return success(data=discount, message="Discount code created.")


@owner_router.get("/{arena_id}/discounts", summary="List discount codes")
async def list_discounts(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_discounts(db, user, arena_id)
    return success(data=rows, message="Discount codes retrieved.")


@owner_router.patch("/{arena_id}/discounts/{discount_id}", summary="Update a discount code")
async def update_discount(
    arena_id: uuid.UUID,
    discount_id: uuid.UUID,
    data: DiscountCodeUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    discount = await service.update_discount(db, user, arena_id, discount_id, data)
    return success(data=discount, message="Discount code updated.")


@owner_router.delete("/{arena_id}/discounts/{discount_id}", summary="Delete a discount code")
async def delete_discount(
    arena_id: uuid.UUID,
    discount_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_discount(db, user, arena_id, discount_id)
    return success(message="Discount code deleted.")


# ---- bank details (manual bank_transfer payment method) --------------------


@owner_router.get("/{arena_id}/bank-details", summary="List my arena's bank accounts")
async def list_owner_bank_details(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_owner_bank_details(db, user, arena_id)
    return success(data=data, message="Bank accounts retrieved.")


@owner_router.post(
    "/{arena_id}/bank-details",
    summary="Request adding a bank account to my arena (sends OTP; always needed for a new one)",
)
async def add_bank_details(
    arena_id: uuid.UUID,
    data: ArenaBankDetailsCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.request_add_bank_details(db, user, arena_id, data)
    if not result.delivered:
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(user.email)}.")


@owner_router.patch(
    "/{arena_id}/bank-details/{bank_details_id}",
    summary="Update one of my arena's bank accounts (OTP needed only if the account number, "
    "name or bank changes)",
)
async def update_bank_details(
    arena_id: uuid.UUID,
    bank_details_id: uuid.UUID,
    data: ArenaBankDetailsUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.request_update_bank_details(db, user, arena_id, bank_details_id, data)
    if result.applied:
        return success(data=result.record, message="Bank account updated.")
    if not result.delivered:
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(user.email)}.")


@owner_router.delete(
    "/{arena_id}/bank-details/{bank_details_id}",
    summary="Request removing one of my arena's bank accounts (sends OTP)",
)
async def delete_bank_details(
    arena_id: uuid.UUID,
    bank_details_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.request_delete_bank_details(db, user, arena_id, bank_details_id)
    if not result.delivered:
        raise ServiceUnavailableError(codes.NOT_SENT_MESSAGE)
    return success(message=f"We sent a 6-digit code to {codes.mask_address(user.email)}.")


@owner_router.post(
    "/{arena_id}/bank-details/verify",
    summary="Confirm a pending bank account change with its emailed code",
)
async def verify_bank_details_change(
    arena_id: uuid.UUID,
    data: BankDetailsVerifyRequest,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    result = await service.verify_bank_details_change(db, user, arena_id, data.code)
    return success(data=result, message="Bank account change confirmed.")
