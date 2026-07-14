"""Court endpoints.

* ``router`` — public court listing under an approved arena.
* ``owner_router`` (``/owner``) — court + peak-pricing management, guarded by
  ``require_role("owner")``. Court ownership is derived from the parent arena.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.court import service
from app.modules.court.schema import (
    AvailabilityUpdate,
    CourtCreate,
    CourtUpdate,
    PricingRuleCreate,
    PricingRuleUpdate,
)
from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.response import success

router = APIRouter(tags=["courts"])
owner_router = APIRouter(prefix="/owner", tags=["courts-owner"])

_owner = require_role("owner")


# ---- public discovery ---------------------------------------------------


@router.get("/arenas/{arena_id}/courts", summary="List available courts for an arena")
async def list_public_courts(
    arena_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    rows = await service.list_public_courts(db, arena_id)
    return success(data=rows, message="Courts retrieved.")


@router.get(
    "/courts/{court_id}/pricing-rules",
    summary="List a court's active peak-pricing windows",
)
async def list_public_pricing_rules(
    court_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    rows = await service.list_public_pricing_rules(db, court_id)
    return success(data=rows, message="Pricing rules retrieved.")


# ---- owner: courts ------------------------------------------------------


@owner_router.post(
    "/arenas/{arena_id}/courts",
    status_code=status.HTTP_201_CREATED,
    summary="Add a court to an arena",
)
async def create_court(
    arena_id: uuid.UUID,
    data: CourtCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    court = await service.create_court(db, user, arena_id, data)
    return success(data=court, message="Court created.")


@owner_router.get("/arenas/{arena_id}/courts", summary="List my arena's courts")
async def list_courts(
    arena_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_owner_courts(db, user, arena_id)
    return success(data=rows, message="Courts retrieved.")


@owner_router.get("/courts/{court_id}", summary="Get one of my courts")
async def get_court(
    court_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    court = await service.get_owned_court(db, user, court_id)
    return success(data=court, message="Court retrieved.")


@owner_router.patch("/courts/{court_id}", summary="Update a court")
async def update_court(
    court_id: uuid.UUID,
    data: CourtUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    court = await service.update_court(db, user, court_id, data)
    return success(data=court, message="Court updated.")


@owner_router.patch("/courts/{court_id}/availability", summary="Toggle court availability")
async def set_availability(
    court_id: uuid.UUID,
    data: AvailabilityUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    court = await service.set_availability(db, user, court_id, data)
    return success(data=court, message="Court availability updated.")


@owner_router.delete("/courts/{court_id}", summary="Delete a court")
async def delete_court(
    court_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_court(db, user, court_id)
    return success(message="Court deleted.")


# ---- owner: peak-pricing rules ------------------------------------------


@owner_router.post(
    "/courts/{court_id}/pricing-rules",
    status_code=status.HTTP_201_CREATED,
    summary="Add a peak-pricing rule",
)
async def create_pricing_rule(
    court_id: uuid.UUID,
    data: PricingRuleCreate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rule = await service.add_pricing_rule(db, user, court_id, data)
    return success(data=rule, message="Pricing rule created.")


@owner_router.get("/courts/{court_id}/pricing-rules", summary="List peak-pricing rules")
async def list_pricing_rules(
    court_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows = await service.list_pricing_rules(db, user, court_id)
    return success(data=rows, message="Pricing rules retrieved.")


@owner_router.patch(
    "/courts/{court_id}/pricing-rules/{rule_id}", summary="Update a peak-pricing rule"
)
async def update_pricing_rule(
    court_id: uuid.UUID,
    rule_id: uuid.UUID,
    data: PricingRuleUpdate,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rule = await service.update_pricing_rule(db, user, court_id, rule_id, data)
    return success(data=rule, message="Pricing rule updated.")


@owner_router.delete(
    "/courts/{court_id}/pricing-rules/{rule_id}", summary="Delete a peak-pricing rule"
)
async def delete_pricing_rule(
    court_id: uuid.UUID,
    rule_id: uuid.UUID,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_pricing_rule(db, user, court_id, rule_id)
    return success(message="Pricing rule deleted.")
