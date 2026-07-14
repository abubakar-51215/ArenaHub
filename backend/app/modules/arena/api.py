"""Arena endpoints.

Two routers:
* ``router`` (``/arenas``) — public discovery (approved + active only).
* ``owner_router`` (``/owner/arenas``) — owner management, guarded by
  ``require_role("owner")`` (the Track A integration contract).
"""

import uuid
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.arena import service
from app.modules.arena.model import ArenaCity
from app.modules.arena.schema import (
    ArenaCreate,
    ArenaUpdate,
    BlockedDateCreate,
    DiscountCodeCreate,
    DiscountCodeUpdate,
)
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/arenas", tags=["arenas"])
owner_router = APIRouter(prefix="/owner/arenas", tags=["arenas-owner"])

_owner = require_role("owner")


# ---- public discovery ---------------------------------------------------


@router.get("", summary="Search approved arenas")
async def search_arenas(
    q: str | None = None,
    city: ArenaCity | None = None,
    sport: str | None = None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    sort: str = "newest",
    params: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.search_arenas(
        db,
        q=q,
        city=city,
        sport=sport,
        price_min=price_min,
        price_max=price_max,
        sort=sort,
        params=params,
    )
    return success(data=data, message="Arenas retrieved.")


@router.get("/{arena_id}", summary="Get a public arena")
async def get_arena(arena_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    data = await service.get_public_arena(db, arena_id)
    return success(data=data, message="Arena retrieved.")


# ---- owner management ----------------------------------------------------


@owner_router.post("", status_code=status.HTTP_201_CREATED, summary="Register a new arena")
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
