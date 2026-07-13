"""Court business logic: CRUD, availability toggle, base pricing, images, and
peak-pricing rules — all gated on ownership of the parent arena.

Ownership is derived from the arena (courts have no direct owner column), so
every mutating path resolves ``court → arena → owner`` before proceeding.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena, ArenaStatus
from app.modules.court import repository as repo
from app.modules.court.model import Court, CourtPricingRule
from app.modules.court.schema import (
    AvailabilityUpdate,
    CourtCreate,
    CourtResponse,
    CourtUpdate,
    PricingRuleCreate,
    PricingRuleResponse,
    PricingRuleUpdate,
)
from app.modules.user.model import User


async def _owned_arena(db: AsyncSession, arena_id: uuid.UUID, user: User) -> Arena:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    return arena


async def _owned_court(db: AsyncSession, court_id: uuid.UUID, user: User) -> Court:
    court = await repo.get_court(db, court_id)
    if court is None:
        raise NotFoundError("Court not found.")
    await _owned_arena(db, court.arena_id, user)
    return court


async def create_court(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: CourtCreate
) -> CourtResponse:
    await _owned_arena(db, arena_id, user)
    court = Court(
        arena_id=arena_id,
        name=data.name,
        description=data.description,
        sport_types=data.sport_types,
        capacity=data.capacity,
        base_price=data.base_price,
        images=data.images,
        is_available=data.is_available,
    )
    saved = await repo.add_court(db, court)
    await db.commit()
    return CourtResponse.model_validate(saved)


async def list_owner_courts(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[CourtResponse]:
    await _owned_arena(db, arena_id, user)
    rows = await repo.list_courts(db, arena_id)
    return [CourtResponse.model_validate(c) for c in rows]


async def get_owned_court(db: AsyncSession, user: User, court_id: uuid.UUID) -> CourtResponse:
    court = await _owned_court(db, court_id, user)
    return CourtResponse.model_validate(court)


async def update_court(
    db: AsyncSession, user: User, court_id: uuid.UUID, data: CourtUpdate
) -> CourtResponse:
    court = await _owned_court(db, court_id, user)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(court, field, value)
    await db.commit()
    return CourtResponse.model_validate(court)


async def set_availability(
    db: AsyncSession, user: User, court_id: uuid.UUID, data: AvailabilityUpdate
) -> CourtResponse:
    court = await _owned_court(db, court_id, user)
    court.is_available = data.is_available
    await db.commit()
    return CourtResponse.model_validate(court)


async def delete_court(db: AsyncSession, user: User, court_id: uuid.UUID) -> None:
    court = await _owned_court(db, court_id, user)
    await db.delete(court)
    await db.commit()


# ---- public discovery ---------------------------------------------------


async def list_public_courts(db: AsyncSession, arena_id: uuid.UUID) -> list[CourtResponse]:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")
    rows = await repo.list_courts(db, arena_id, available_only=True)
    return [CourtResponse.model_validate(c) for c in rows]


# ---- peak-pricing rules -------------------------------------------------


async def add_pricing_rule(
    db: AsyncSession, user: User, court_id: uuid.UUID, data: PricingRuleCreate
) -> PricingRuleResponse:
    await _owned_court(db, court_id, user)
    rule = CourtPricingRule(
        court_id=court_id,
        name=data.name,
        weekday=int(data.weekday) if data.weekday is not None else None,
        start_time=data.start_time,
        end_time=data.end_time,
        price_multiplier=data.price_multiplier,
        is_active=data.is_active,
    )
    saved = await repo.add_pricing_rule(db, rule)
    await db.commit()
    return PricingRuleResponse.model_validate(saved)


async def list_pricing_rules(
    db: AsyncSession, user: User, court_id: uuid.UUID
) -> list[PricingRuleResponse]:
    await _owned_court(db, court_id, user)
    rows = await repo.list_pricing_rules(db, court_id)
    return [PricingRuleResponse.model_validate(r) for r in rows]


async def _owned_rule(
    db: AsyncSession, user: User, court_id: uuid.UUID, rule_id: uuid.UUID
) -> CourtPricingRule:
    await _owned_court(db, court_id, user)
    rule = await repo.get_pricing_rule(db, rule_id)
    if rule is None or rule.court_id != court_id:
        raise NotFoundError("Pricing rule not found.")
    return rule


async def update_pricing_rule(
    db: AsyncSession,
    user: User,
    court_id: uuid.UUID,
    rule_id: uuid.UUID,
    data: PricingRuleUpdate,
) -> PricingRuleResponse:
    rule = await _owned_rule(db, user, court_id, rule_id)
    fields = data.model_dump(exclude_unset=True)
    if "weekday" in fields and fields["weekday"] is not None:
        fields["weekday"] = int(fields["weekday"])
    for field, value in fields.items():
        setattr(rule, field, value)
    if rule.end_time <= rule.start_time:
        raise ValidationError("end_time must be after start_time.")
    await db.commit()
    return PricingRuleResponse.model_validate(rule)


async def delete_pricing_rule(
    db: AsyncSession, user: User, court_id: uuid.UUID, rule_id: uuid.UUID
) -> None:
    rule = await _owned_rule(db, user, court_id, rule_id)
    await db.delete(rule)
    await db.commit()
