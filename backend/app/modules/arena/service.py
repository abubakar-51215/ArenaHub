"""Arena business logic: CRUD + ownership guards, operating hours, payment /
refund config, amenities, blocked dates, discount codes, and the owner-side
status transitions (submit / resubmit for verification).

Admin approve/reject lives in ``modules/admin`` but reuses ``set_status`` here
so the state machine has a single implementation.
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as repo
from app.modules.arena.model import Arena, ArenaBlockedDate, ArenaCity, ArenaStatus, DiscountCode
from app.modules.arena.schema import (
    ArenaCreate,
    ArenaResponse,
    ArenaUpdate,
    BlockedDateCreate,
    BlockedDateResponse,
    DiscountCodeCreate,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)
from app.modules.user.model import User
from app.shared.pagination import PaginationParams, paginated

# Fields that map 1:1 from the update schema onto the model.
_SCALAR_UPDATE_FIELDS = (
    "name",
    "description",
    "address",
    "city",
    "area",
    "latitude",
    "longitude",
    "contact_phone",
    "advance_percentage",
    "require_full_payment",
)


async def _owned_arena(db: AsyncSession, arena_id: uuid.UUID, user: User) -> Arena:
    """Load an arena and assert the caller owns it (404 first, then 403)."""
    arena = await repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    return arena


async def _resolve_amenities(db: AsyncSession, amenity_ids: list[uuid.UUID]) -> list:
    unique = list(dict.fromkeys(amenity_ids))
    amenities = await repo.get_amenities_by_ids(db, unique)
    if len(amenities) != len(unique):
        raise ValidationError("One or more amenity ids are invalid.")
    return amenities


async def create_arena(db: AsyncSession, user: User, data: ArenaCreate) -> ArenaResponse:
    amenities = await _resolve_amenities(db, data.amenity_ids)
    arena = Arena(
        owner_id=user.id,
        name=data.name,
        description=data.description,
        address=data.address,
        city=data.city,
        area=data.area,
        latitude=data.latitude,
        longitude=data.longitude,
        contact_phone=data.contact_phone,
        contact_email=data.contact_email,
        operating_hours={day: h.model_dump() for day, h in data.operating_hours.items()},
        sports_offered=data.sports_offered,
        images=data.images,
        advance_percentage=data.advance_percentage,
        require_full_payment=data.require_full_payment,
        refund_policy=[t.model_dump() for t in data.refund_policy],
        status=ArenaStatus.pending,
    )
    arena.amenities = amenities
    saved = await repo.add_arena(db, arena)
    await db.commit()
    return ArenaResponse.model_validate(saved)


async def get_owned_arena(db: AsyncSession, user: User, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await _owned_arena(db, arena_id, user)
    return ArenaResponse.model_validate(arena)


async def list_owner_arenas(db: AsyncSession, user: User, params: PaginationParams) -> dict:
    arenas, total = await repo.list_owner_arenas(
        db, user.id, offset=params.offset, limit=params.page_size
    )
    items = [ArenaResponse.model_validate(a) for a in arenas]
    return paginated(items, total, params)


async def update_arena(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: ArenaUpdate
) -> ArenaResponse:
    arena = await _owned_arena(db, arena_id, user)
    fields = data.model_dump(exclude_unset=True)

    for name in _SCALAR_UPDATE_FIELDS:
        if name in fields:
            setattr(arena, name, fields[name])
    if "contact_email" in fields:
        arena.contact_email = fields["contact_email"]
    if data.operating_hours is not None:
        arena.operating_hours = {d: h.model_dump() for d, h in data.operating_hours.items()}
    if data.sports_offered is not None:
        arena.sports_offered = data.sports_offered
    if data.images is not None:
        arena.images = data.images
    if data.refund_policy is not None:
        arena.refund_policy = [t.model_dump() for t in data.refund_policy]
    if data.amenity_ids is not None:
        arena.amenities = await _resolve_amenities(db, data.amenity_ids)

    await db.commit()
    refreshed = await repo.get_arena(db, arena.id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)


async def deactivate_arena(db: AsyncSession, user: User, arena_id: uuid.UUID) -> None:
    """Owner takes an arena offline (soft): hidden from public search, kept for
    the owner. Reversible by re-activating through update in a later sprint."""
    arena = await _owned_arena(db, arena_id, user)
    arena.is_active = False
    await db.commit()


async def resubmit_for_verification(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> ArenaResponse:
    """Owner resubmits a rejected arena for review (rejected → pending)."""
    arena = await _owned_arena(db, arena_id, user)
    if arena.status != ArenaStatus.rejected:
        raise ConflictError("Only a rejected arena can be resubmitted.")
    arena.status = ArenaStatus.pending
    arena.rejection_reason = None
    await db.commit()
    refreshed = await repo.get_arena(db, arena.id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)


async def set_status(
    db: AsyncSession, arena: Arena, status: ArenaStatus, *, reason: str | None = None
) -> Arena:
    """State-machine transition used by the admin verification slice. Caller
    commits. ``reason`` is required for a rejection and cleared on approval."""
    if status == ArenaStatus.rejected and not reason:
        raise ValidationError("A rejection reason is required.")
    arena.status = status
    arena.rejection_reason = reason if status == ArenaStatus.rejected else None
    return arena


# ---- public discovery ---------------------------------------------------


async def search_arenas(
    db: AsyncSession,
    *,
    q: str | None,
    city: ArenaCity | None,
    sport: str | None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    sort: str = "newest",
    params: PaginationParams,
) -> dict:
    arenas, total = await repo.search_public_arenas(
        db,
        q=q,
        city=city,
        sport=sport,
        price_min=price_min,
        price_max=price_max,
        sort=sort,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [ArenaResponse.model_validate(a) for a in arenas]
    return paginated(items, total, params)


async def get_public_arena(db: AsyncSession, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await repo.get_arena(db, arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")
    return ArenaResponse.model_validate(arena)


# ---- blocked dates ------------------------------------------------------


async def add_blocked_date(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: BlockedDateCreate
) -> BlockedDateResponse:
    await _owned_arena(db, arena_id, user)
    existing = await repo.list_blocked_dates(db, arena_id)
    if any(b.blocked_date == data.blocked_date for b in existing):
        raise ConflictError("That date is already blocked.")
    blocked = ArenaBlockedDate(
        arena_id=arena_id, blocked_date=data.blocked_date, reason=data.reason
    )
    saved = await repo.add_blocked_date(db, blocked)
    await db.commit()
    return BlockedDateResponse.model_validate(saved)


async def list_blocked_dates(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[BlockedDateResponse]:
    await _owned_arena(db, arena_id, user)
    rows = await repo.list_blocked_dates(db, arena_id)
    return [BlockedDateResponse.model_validate(r) for r in rows]


async def remove_blocked_date(
    db: AsyncSession, user: User, arena_id: uuid.UUID, blocked_id: uuid.UUID
) -> None:
    await _owned_arena(db, arena_id, user)
    blocked = await repo.get_blocked_date(db, blocked_id)
    if blocked is None or blocked.arena_id != arena_id:
        raise NotFoundError("Blocked date not found.")
    await db.delete(blocked)
    await db.commit()


# ---- discount codes -----------------------------------------------------


async def create_discount(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: DiscountCodeCreate
) -> DiscountCodeResponse:
    await _owned_arena(db, arena_id, user)
    if await repo.get_discount_by_code(db, arena_id, data.code):
        raise ConflictError("A discount code with that name already exists.")
    discount = DiscountCode(
        arena_id=arena_id,
        code=data.code,
        description=data.description,
        discount_type=data.discount_type,
        discount_value=data.discount_value,
        min_booking_amount=data.min_booking_amount,
        max_uses=data.max_uses,
        valid_from=data.valid_from,
        valid_until=data.valid_until,
        is_active=data.is_active,
    )
    saved = await repo.add_discount(db, discount)
    await db.commit()
    return DiscountCodeResponse.model_validate(saved)


async def list_discounts(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[DiscountCodeResponse]:
    await _owned_arena(db, arena_id, user)
    rows = await repo.list_discounts(db, arena_id)
    return [DiscountCodeResponse.model_validate(r) for r in rows]


async def _owned_discount(
    db: AsyncSession, user: User, arena_id: uuid.UUID, discount_id: uuid.UUID
) -> DiscountCode:
    await _owned_arena(db, arena_id, user)
    discount = await repo.get_discount(db, discount_id)
    if discount is None or discount.arena_id != arena_id:
        raise NotFoundError("Discount code not found.")
    return discount


async def update_discount(
    db: AsyncSession,
    user: User,
    arena_id: uuid.UUID,
    discount_id: uuid.UUID,
    data: DiscountCodeUpdate,
) -> DiscountCodeResponse:
    discount = await _owned_discount(db, user, arena_id, discount_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(discount, field, value)
    if discount.valid_from and discount.valid_until and discount.valid_until <= discount.valid_from:
        raise ValidationError("valid_until must be after valid_from.")
    await db.commit()
    return DiscountCodeResponse.model_validate(discount)


async def delete_discount(
    db: AsyncSession, user: User, arena_id: uuid.UUID, discount_id: uuid.UUID
) -> None:
    discount = await _owned_discount(db, user, arena_id, discount_id)
    await db.delete(discount)
    await db.commit()
