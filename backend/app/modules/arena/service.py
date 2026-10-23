"""Arena business logic: CRUD + ownership guards, operating hours, payment /
refund config, amenities, blocked dates, discount codes, and the owner-side
status transitions (submit / resubmit for verification).

Admin approve/reject lives in ``modules/admin`` but reuses ``set_status`` here
so the state machine has a single implementation.
"""

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import redis as redis_cache
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.messages import BLOCKED_DATE_IN_PAST
from app.modules.arena import repository as repo
from app.modules.arena.model import (
    Arena,
    ArenaBankDetails,
    ArenaBlockedDate,
    ArenaCity,
    ArenaStatus,
    DiscountCode,
    DiscountType,
)
from app.modules.arena.schema import (
    ArenaBankDetailsCreate,
    ArenaBankDetailsResponse,
    ArenaBankDetailsUpdate,
    ArenaCreate,
    ArenaListItem,
    ArenaResponse,
    ArenaUpdate,
    BlockedDateCreate,
    BlockedDateResponse,
    DiscountCodeCreate,
    DiscountCodeResponse,
    DiscountCodeUpdate,
)
from app.modules.slot import repository as slot_repo
from app.modules.user.model import User, UserRole
from app.shared import codes
from app.shared.audit import audit
from app.shared.notify import notify_admins
from app.shared.otp import OtpPurpose
from app.shared.pagination import PaginationParams, paginated
from app.shared.storage import delete_image
from app.shared.timezone import platform_today

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
    """Load an arena and assert the caller owns it. Not yours = "not found" (the same answer as an
    arena that does not exist, so ownership is never revealed)."""
    arena = await repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        # another owner's arena answers exactly like one that does not exist
        raise NotFoundError("Arena not found.")
    return arena


async def _editable_owned_arena(db: AsyncSession, arena_id: uuid.UUID, user: User) -> Arena:
    """An owned arena the owner may still change. An arena removed by an
    admin is read-only for its owner. A suspended one can still be edited
    (to fix what led to the suspension); its suspension columns are never
    written here, so nothing the owner does lifts it."""
    arena = await _owned_arena(db, arena_id, user)
    if arena.is_deleted:
        raise ValidationError("This arena was removed by ArenaHub and can no longer be changed.")
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
    await notify_admins(db, "arena_waiting", arena_id=str(saved.id), arena_name=saved.name)
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
    arena = await _editable_owned_arena(db, arena_id, user)
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
        for removed in set(arena.images or []) - set(data.images):
            delete_image(removed)  # drop pictures the owner took off the arena
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
    arena = await _editable_owned_arena(db, arena_id, user)
    arena.is_active = False
    await db.commit()


async def resubmit_for_verification(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> ArenaResponse:
    """Owner resubmits a rejected arena for review (rejected → pending)."""
    arena = await _editable_owned_arena(db, arena_id, user)
    if arena.status != ArenaStatus.rejected:
        raise ConflictError("Only a rejected arena can be resubmitted.")
    arena.status = ArenaStatus.pending
    arena.rejection_reason = None
    await notify_admins(db, "arena_waiting", arena_id=str(arena.id), arena_name=arena.name)
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


async def list_items(db: AsyncSession, arenas: list) -> list[ArenaListItem]:
    """List-card items: each arena plus its rating, review count and from-price.
    One summary query covers the whole page."""
    summaries = await repo.arena_summaries(db, [a.id for a in arenas])
    items: list[ArenaListItem] = []
    for arena in arenas:
        summary = summaries.get(arena.id)
        items.append(
            ArenaListItem(
                **ArenaResponse.model_validate(arena).model_dump(),
                avg_rating=summary.avg_rating if summary else None,
                review_count=summary.review_count if summary else 0,
                min_price=summary.min_price if summary else None,
            )
        )
    return items


async def search_arenas(
    db: AsyncSession,
    *,
    q: str | None,
    city: ArenaCity | None,
    sport: str | None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    sort: str = "newest",
    near: tuple[float, float] | None = None,
    radius_km: float | None = None,
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
        near=near,
        radius_km=radius_km,
    )
    items = await list_items(db, arenas)
    if near:
        # the position was only a search parameter: it is used here and forgotten. An arena
        # with no coordinates of its own has no distance to show (never dropped unless a
        # radius was set — the repository query already excludes it there).
        for item in items:
            if item.latitude is None or item.longitude is None:
                continue
            item.distance_km = round(
                repo.distance_km(near[0], near[1], float(item.latitude), float(item.longitude)), 2
            )
    return paginated(items, total, params)


async def get_trending_arenas(
    db: AsyncSession, *, days: int, city: ArenaCity | None, limit: int
) -> list[ArenaListItem]:
    """Arenas ranked by booking volume over the last ``days`` days. Falls
    back to the rating-ranked "popular" sort when the window has no bookings
    at all (a cold-start dataset, or an unlucky city filter) — an empty
    Trending section reads as broken, a popularity fallback doesn't."""
    since = datetime.now() - timedelta(days=days)
    arenas = await repo.list_trending_arenas(db, since=since, city=city, limit=limit)
    if not arenas:
        arenas, _ = await repo.search_public_arenas(
            db, q=None, city=city, sport=None, sort="rating_desc", offset=0, limit=limit
        )
    return await list_items(db, arenas)


async def get_public_arena(db: AsyncSession, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await repo.get_arena(db, arena_id)
    if arena is None or not arena.is_live:
        raise NotFoundError("Arena not found.")
    return ArenaResponse.model_validate(arena)


# ---- liked arenas (FR-P-12) ----------------------------------------------


async def like_arena(db: AsyncSession, user: User, arena_id: uuid.UUID) -> None:
    """Idempotent: liking an already-liked arena is a no-op, not an error —
    a double-tapped heart shouldn't surface a 409."""
    arena = await repo.get_arena(db, arena_id)
    if arena is None or not arena.is_live:
        raise NotFoundError("Arena not found.")
    if await repo.get_like(db, user.id, arena_id) is None:
        await repo.add_like(db, user.id, arena_id)
        await db.commit()


async def unlike_arena(db: AsyncSession, user: User, arena_id: uuid.UUID) -> None:
    like = await repo.get_like(db, user.id, arena_id)
    if like is not None:
        await db.delete(like)
        await db.commit()


async def list_liked_arenas(db: AsyncSession, user: User, params: PaginationParams) -> dict:
    arenas, total = await repo.list_liked_arenas(
        db, user.id, offset=params.offset, limit=params.page_size
    )
    items = await list_items(db, arenas)
    return paginated(items, total, params)


# ---- blocked dates ------------------------------------------------------


async def add_blocked_date(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: BlockedDateCreate
) -> BlockedDateResponse:
    await _owned_arena(db, arena_id, user)
    if data.blocked_date < platform_today():
        raise ValidationError(BLOCKED_DATE_IN_PAST)
    existing = await repo.list_blocked_dates(db, arena_id)
    if any(b.blocked_date == data.blocked_date for b in existing):
        raise ConflictError("That date is already blocked.")
    booked = await slot_repo.count_booked_on_date(db, arena_id, data.blocked_date)
    if booked:
        word = "booking" if booked == 1 else "bookings"
        raise ConflictError(
            f"This date has {booked} active {word}. Cancel them first, then block the date."
        )
    blocked = ArenaBlockedDate(
        arena_id=arena_id, blocked_date=data.blocked_date, reason=data.reason
    )
    saved = await repo.add_blocked_date(db, blocked)
    await audit(
        db, "arena.block_date", actor=user, target_type="arena", target_id=arena_id,
        details={"blocked_date": data.blocked_date.isoformat(), "reason": data.reason},
    )  # fmt: skip
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
    await audit(
        db, "arena.unblock_date", actor=user, target_type="arena", target_id=arena_id,
        details={"blocked_date": blocked.blocked_date.isoformat()},
    )  # fmt: skip
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
    # DiscountCodeUpdate has no discount_type field (it's immutable after
    # create), so this bound can only be enforced here against the existing
    # type — the create-time model_validator only ever saw the create schema.
    if discount.discount_type is DiscountType.percentage and discount.discount_value > 100:
        raise ValidationError("percentage discount cannot exceed 100.")
    await db.commit()
    return DiscountCodeResponse.model_validate(discount)


async def delete_discount(
    db: AsyncSession, user: User, arena_id: uuid.UUID, discount_id: uuid.UUID
) -> None:
    discount = await _owned_discount(db, user, arena_id, discount_id)
    await db.delete(discount)
    await db.commit()


# ---- bank details (manual bank_transfer payment method) -------------------


async def list_owner_bank_details(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[ArenaBankDetailsResponse]:
    """All of the owner's bank accounts for an arena (may be empty)."""
    await _owned_arena(db, arena_id, user)
    rows = await repo.list_bank_details(db, arena_id)
    return [ArenaBankDetailsResponse.model_validate(r) for r in rows]


async def _owned_bank_details(
    db: AsyncSession, user: User, arena_id: uuid.UUID, bank_details_id: uuid.UUID
) -> ArenaBankDetails:
    await _owned_arena(db, arena_id, user)
    details = await repo.get_bank_details(db, bank_details_id)
    if details is None or details.arena_id != arena_id:
        raise NotFoundError("Bank account not found.")
    return details


async def _ensure_active_default(db: AsyncSession, arena_id: uuid.UUID) -> None:
    """Guarantee the invariant "an arena with any active account has exactly
    one active default". Called after any mutation: if no active account is
    marked default, promote the newest active one; and clear a default flag
    left on an inactive account."""
    accounts = await repo.list_bank_details(db, arena_id)
    active = [a for a in accounts if a.is_active]
    # A default must be active — drop the flag from any inactive account.
    for a in accounts:
        if a.is_default and not a.is_active:
            a.is_default = False
    if active and not any(a.is_default for a in active):
        active[0].is_default = True  # list is default-first then newest


async def _apply_add_bank_details(
    db: AsyncSession, arena_id: uuid.UUID, fields: dict
) -> ArenaBankDetailsResponse:
    fields = dict(fields)
    # A default must be active — asking for a default implies active.
    if fields.get("is_default"):
        fields["is_active"] = True
    details = ArenaBankDetails(arena_id=arena_id, **fields)
    saved = await repo.add_bank_details(db, details)
    if saved.is_default:
        await repo.clear_default_bank_details(db, arena_id, except_id=saved.id)
    await _ensure_active_default(db, arena_id)
    await db.commit()
    return ArenaBankDetailsResponse.model_validate(saved)


async def _apply_update_bank_details(
    db: AsyncSession, details: ArenaBankDetails, arena_id: uuid.UUID, fields: dict
) -> ArenaBankDetailsResponse:
    # Making an account the default also activates it (a default must be
    # active, so it's always offered at checkout).
    if fields.get("is_default"):
        fields["is_active"] = True
    for field, value in fields.items():
        setattr(details, field, value)
    if details.is_default:
        await repo.clear_default_bank_details(db, arena_id, except_id=details.id)
    await _ensure_active_default(db, arena_id)
    await db.commit()
    return ArenaBankDetailsResponse.model_validate(details)


async def _apply_delete_bank_details(
    db: AsyncSession, details: ArenaBankDetails, arena_id: uuid.UUID
) -> None:
    await db.delete(details)
    await db.flush()
    # Removing the default (or any account) may leave the arena without an
    # active default — promote another if so.
    await _ensure_active_default(db, arena_id)
    await db.commit()


# ---- bank details: the emailed-code gate ------------------------------------------------------
#
# Adding or removing an account always needs a code: either is a new or a gone payout
# destination. Editing one needs a code only when the account number, account name or bank
# changes; a pure default/active switch between accounts already on file applies at once, as
# before. The proposed change is staged in Redis (never logged, never in the database), keyed to
# the owner and the arena, for the same 10 minutes a code is good for. A new request always
# replaces both the older staged change AND the older code (``issue_code`` ends the previous code
# for this user and purpose), so a code can only ever apply the change it was issued for.

_BANK_PENDING_TTL = int(codes.CODE_TTL.total_seconds())
_SENSITIVE_BANK_FIELDS = ("account_number", "account_title", "bank_name")


@dataclass
class BankDetailsRequestResult:
    """What happened when a bank-detail change was asked for."""

    applied: bool  # True: a pure default/active switch, done at once
    record: ArenaBankDetailsResponse | None = None  # set when applied
    delivered: bool = True  # set when not applied; False = the code email failed to send


def _bank_pending_key(user_id: uuid.UUID, arena_id: uuid.UUID) -> str:
    return f"bank_pending:{user_id}:{arena_id}"


async def _stage_bank_change(
    user: User, arena_id: uuid.UUID, op: str, bank_details_id: uuid.UUID | None, fields: dict
) -> None:
    client = redis_cache.get_redis()
    payload = json.dumps(
        {
            "op": op,
            "bank_details_id": str(bank_details_id) if bank_details_id else None,
            "fields": fields,
        }
    )
    await client.set(_bank_pending_key(user.id, arena_id), payload, ex=_BANK_PENDING_TTL)


def _bank_change_is_sensitive(details: ArenaBankDetails, fields: dict) -> bool:
    return any(
        field in fields and fields[field] != getattr(details, field)
        for field in _SENSITIVE_BANK_FIELDS
    )


async def request_add_bank_details(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: ArenaBankDetailsCreate
) -> BankDetailsRequestResult:
    await _owned_arena(db, arena_id, user)
    fields = data.model_dump(mode="json")
    await _stage_bank_change(user, arena_id, "add", None, fields)
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.bank_details_change, user.email, name=user.full_name
    )
    return BankDetailsRequestResult(applied=False, delivered=issued.delivered)


async def request_update_bank_details(
    db: AsyncSession,
    user: User,
    arena_id: uuid.UUID,
    bank_details_id: uuid.UUID,
    data: ArenaBankDetailsUpdate,
) -> BankDetailsRequestResult:
    details = await _owned_bank_details(db, user, arena_id, bank_details_id)
    fields = data.model_dump(exclude_unset=True, mode="json")
    if not _bank_change_is_sensitive(details, fields):
        updated = await _apply_update_bank_details(db, details, arena_id, fields)
        return BankDetailsRequestResult(applied=True, record=updated)
    await _stage_bank_change(user, arena_id, "update", bank_details_id, fields)
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.bank_details_change, user.email, name=user.full_name
    )
    return BankDetailsRequestResult(applied=False, delivered=issued.delivered)


async def request_delete_bank_details(
    db: AsyncSession, user: User, arena_id: uuid.UUID, bank_details_id: uuid.UUID
) -> BankDetailsRequestResult:
    await _owned_bank_details(db, user, arena_id, bank_details_id)
    await _stage_bank_change(user, arena_id, "delete", bank_details_id, {})
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.bank_details_change, user.email, name=user.full_name
    )
    return BankDetailsRequestResult(applied=False, delivered=issued.delivered)


async def verify_bank_details_change(
    db: AsyncSession, user: User, arena_id: uuid.UUID, code: str
) -> ArenaBankDetailsResponse | None:
    """Apply the bank-detail change staged for this owner and this arena, once the code
    matches it. ``None`` when the change was a removal."""
    client = redis_cache.get_redis()
    key = _bank_pending_key(user.id, arena_id)
    raw = await client.get(key)
    if raw is None:
        raise ValidationError("No bank account change is pending.")
    pending = json.loads(raw)
    await _owned_arena(db, arena_id, user)
    await codes.check_code(db, user.id, OtpPurpose.bank_details_change, code, user.email)
    await client.delete(key)
    op = pending["op"]
    bank_details_id = uuid.UUID(pending["bank_details_id"]) if pending["bank_details_id"] else None
    if op == "add":
        result = await _apply_add_bank_details(db, arena_id, pending["fields"])
    elif op == "update":
        assert bank_details_id is not None
        details = await _owned_bank_details(db, user, arena_id, bank_details_id)
        result = await _apply_update_bank_details(db, details, arena_id, pending["fields"])
    else:
        assert bank_details_id is not None
        details = await _owned_bank_details(db, user, arena_id, bank_details_id)
        await _apply_delete_bank_details(db, details, arena_id)
        result = None
    await audit(
        db, f"bank_details.{op}", actor=user, target_type="arena", target_id=arena_id, commit=True
    )
    return result


async def get_bank_details_for_checkout(
    db: AsyncSession, user: User, arena_id: uuid.UUID
) -> list[ArenaBankDetailsResponse]:
    """Who may see an arena's bank account: the arena's own owner, an admin, or a player who is
    paying for a booking at that arena right now (unpaid, or waiting for the owner to check the
    receipt). Anyone else gets the same "not found" as an arena that does not exist, so the
    accounts of arenas cannot be read by walking through arena ids. A confirmed booking with a
    balance still owed counts: that balance can be paid by bank transfer too. Active accounts,
    default first, so the player can pick which to transfer to."""
    from app.modules.booking import repository as booking_repo

    arena = await repo.get_arena(db, arena_id)
    allowed = (
        arena is not None
        and arena.is_live
        and (
            user.role == UserRole.admin
            or arena.owner_id == user.id
            or (
                user.role == UserRole.player
                and await booking_repo.player_owes_money_at_arena(db, user.id, arena_id)
            )
        )
    )
    if not allowed:
        raise NotFoundError("Arena not found.")
    rows = await repo.list_active_bank_details(db, arena_id)
    if not rows:
        raise NotFoundError("This arena has not set up bank transfer details yet.")
    return [ArenaBankDetailsResponse.model_validate(r) for r in rows]
