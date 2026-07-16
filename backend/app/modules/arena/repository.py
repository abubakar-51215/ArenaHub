"""Data access for arenas, amenities, blocked dates, and discount codes.

Repository layer: queries and inserts only, no business rules. Callers own the
transaction (commit in the service). Amenities are eager-loaded so response
serialization never triggers a lazy load on the async session.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import cast

from sqlalchemy import CursorResult, Select, UnaryExpression, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.arena.model import (
    Amenity,
    Arena,
    ArenaBankDetails,
    ArenaBlockedDate,
    ArenaCity,
    ArenaLike,
    ArenaStatus,
    DiscountCode,
)
from app.modules.booking.model import Booking, BookingStatus
from app.modules.court.model import Court
from app.modules.review.model import Review

# ---- arenas -------------------------------------------------------------


def _with_amenities(stmt: Select) -> Select:
    return stmt.options(selectinload(Arena.amenities))


async def get_arena(db: AsyncSession, arena_id: uuid.UUID) -> Arena | None:
    result = await db.execute(_with_amenities(select(Arena).where(Arena.id == arena_id)))
    return result.scalar_one_or_none()


async def add_arena(db: AsyncSession, arena: Arena) -> Arena:
    db.add(arena)
    await db.flush()
    # Re-fetch through the eager-loading path so `.amenities` is populated.
    refreshed = await get_arena(db, arena.id)
    assert refreshed is not None
    return refreshed


async def get_amenities_by_ids(db: AsyncSession, ids: list[uuid.UUID]) -> list[Amenity]:
    if not ids:
        return []
    result = await db.execute(select(Amenity).where(Amenity.id.in_(ids)))
    return list(result.scalars().all())


async def list_owner_arenas(
    db: AsyncSession, owner_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[Arena], int]:
    base = select(Arena).where(Arena.owner_id == owner_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        _with_amenities(base).order_by(Arena.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


async def list_owner_arena_ids(
    db: AsyncSession, owner_id: uuid.UUID, *, city: ArenaCity | None = None
) -> list[uuid.UUID]:
    stmt = select(Arena.id).where(Arena.owner_id == owner_id)
    if city is not None:
        stmt = stmt.where(Arena.city == city)
    result = await db.execute(stmt)
    return list(result.scalars().all())


_MIN_PRICE_SUBQ = (
    select(func.min(Court.base_price)).where(Court.arena_id == Arena.id).scalar_subquery()
)
_AVG_RATING_SUBQ = (
    select(func.avg(Review.rating)).where(Review.arena_id == Arena.id).scalar_subquery()
)


async def search_public_arenas(
    db: AsyncSession,
    *,
    q: str | None,
    city: ArenaCity | None,
    sport: str | None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    sort: str = "newest",
    offset: int,
    limit: int,
) -> tuple[list[Arena], int]:
    """Approved + active arenas only — the public discovery query.

    ``price_min``/``price_max`` filter on each arena's cheapest court (a
    price-range slider filters "arenas with something in this range", not
    "every court is in this range"). ``sort`` supports ``newest`` (default),
    ``name``, ``price_asc``/``price_desc`` (by cheapest court), and
    ``rating_desc`` (by average review rating, unrated arenas sort last).
    """
    base = select(Arena).where(Arena.status == ArenaStatus.approved, Arena.is_active.is_(True))
    if q:
        like = f"%{q.lower()}%"
        base = base.where(func.lower(Arena.name).like(like))
    if city:
        base = base.where(Arena.city == city)
    if sport:
        # sports_offered is a JSONB array of strings.
        base = base.where(Arena.sports_offered.contains([sport]))
    if price_min is not None:
        base = base.where(price_min <= _MIN_PRICE_SUBQ)
    if price_max is not None:
        base = base.where(price_max >= _MIN_PRICE_SUBQ)

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    order: tuple[UnaryExpression]
    if sort == "name":
        order = (Arena.name.asc(),)
    elif sort == "price_asc":
        order = (_MIN_PRICE_SUBQ.asc().nulls_last(),)
    elif sort == "price_desc":
        order = (_MIN_PRICE_SUBQ.desc().nulls_last(),)
    elif sort == "rating_desc":
        order = (_AVG_RATING_SUBQ.desc().nulls_last(),)
    else:
        order = (Arena.created_at.desc(),)

    result = await db.execute(_with_amenities(base).order_by(*order).offset(offset).limit(limit))
    return list(result.scalars().all()), total


_NON_TRENDING_STATUSES = (BookingStatus.cancelled, BookingStatus.rejected)


async def list_trending_arenas(
    db: AsyncSession, *, since: datetime, city: ArenaCity | None, limit: int
) -> list[Arena]:
    """Approved + active arenas ranked by booking count since ``since``
    (cancelled/rejected bookings don't count as demand). Empty when nothing
    was booked in the window — the caller falls back to a popularity sort
    rather than showing a blank "Trending" section."""
    booking_count = func.count(Booking.id)
    base = (
        select(Arena, booking_count.label("recent_bookings"))
        .join(Booking, Booking.arena_id == Arena.id)
        .where(
            Arena.status == ArenaStatus.approved,
            Arena.is_active.is_(True),
            Booking.created_at >= since,
            Booking.status.not_in(_NON_TRENDING_STATUSES),
        )
    )
    if city:
        base = base.where(Arena.city == city)
    result = await db.execute(
        _with_amenities(base).group_by(Arena.id).order_by(booking_count.desc()).limit(limit)
    )
    return [arena for arena, _count in result.all()]


async def list_arenas_by_status(
    db: AsyncSession, status: ArenaStatus, *, offset: int, limit: int
) -> tuple[list[Arena], int]:
    """Admin verification queue, oldest-first (FIFO review order)."""
    base = select(Arena).where(Arena.status == status)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        _with_amenities(base).order_by(Arena.created_at.asc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


# ---- blocked dates ------------------------------------------------------


async def get_blocked_date(db: AsyncSession, blocked_id: uuid.UUID) -> ArenaBlockedDate | None:
    return await db.get(ArenaBlockedDate, blocked_id)


async def list_blocked_dates(db: AsyncSession, arena_id: uuid.UUID) -> list[ArenaBlockedDate]:
    result = await db.execute(
        select(ArenaBlockedDate)
        .where(ArenaBlockedDate.arena_id == arena_id)
        .order_by(ArenaBlockedDate.blocked_date.asc())
    )
    return list(result.scalars().all())


async def add_blocked_date(db: AsyncSession, blocked: ArenaBlockedDate) -> ArenaBlockedDate:
    db.add(blocked)
    await db.flush()
    return blocked


# ---- discount codes -----------------------------------------------------


async def get_discount(db: AsyncSession, discount_id: uuid.UUID) -> DiscountCode | None:
    return await db.get(DiscountCode, discount_id)


async def get_discount_by_code(
    db: AsyncSession, arena_id: uuid.UUID, code: str
) -> DiscountCode | None:
    result = await db.execute(
        select(DiscountCode).where(DiscountCode.arena_id == arena_id, DiscountCode.code == code)
    )
    return result.scalar_one_or_none()


async def try_increment_discount_usage(db: AsyncSession, discount_id: uuid.UUID) -> bool:
    """Atomically increments ``used_count`` only if the row still has uses
    left, in one round trip — closes the check-then-increment TOCTOU race
    where two concurrent bookings both read ``used_count < max_uses`` before
    either commits. Returns False if the discount has no uses left (unlimited
    discounts, ``max_uses IS NULL``, always succeed)."""
    result = cast(
        CursorResult,
        await db.execute(
            update(DiscountCode)
            .where(
                DiscountCode.id == discount_id,
                or_(
                    DiscountCode.max_uses.is_(None), DiscountCode.used_count < DiscountCode.max_uses
                ),
            )
            .values(used_count=DiscountCode.used_count + 1)
        ),
    )
    return result.rowcount > 0


async def list_discounts(db: AsyncSession, arena_id: uuid.UUID) -> list[DiscountCode]:
    result = await db.execute(
        select(DiscountCode)
        .where(DiscountCode.arena_id == arena_id)
        .order_by(DiscountCode.created_at.desc())
    )
    return list(result.scalars().all())


async def add_discount(db: AsyncSession, discount: DiscountCode) -> DiscountCode:
    db.add(discount)
    await db.flush()
    return discount


# ---- liked arenas (FR-P-12) ----------------------------------------------


async def get_like(db: AsyncSession, player_id: uuid.UUID, arena_id: uuid.UUID) -> ArenaLike | None:
    result = await db.execute(
        select(ArenaLike).where(ArenaLike.player_id == player_id, ArenaLike.arena_id == arena_id)
    )
    return result.scalar_one_or_none()


async def add_like(db: AsyncSession, player_id: uuid.UUID, arena_id: uuid.UUID) -> ArenaLike:
    like = ArenaLike(player_id=player_id, arena_id=arena_id)
    db.add(like)
    await db.flush()
    return like


async def list_liked_arenas(
    db: AsyncSession, player_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[Arena], int]:
    """A player's liked arenas, most recently liked first. Arenas that have
    since been suspended/unapproved stay listed — the bookmark is the
    player's, and hiding it silently would look like data loss."""
    base = (
        select(Arena)
        .join(ArenaLike, ArenaLike.arena_id == Arena.id)
        .where(ArenaLike.player_id == player_id)
    )
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        _with_amenities(base).order_by(ArenaLike.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


# ---- bank details (manual bank_transfer payment method) -------------------


async def list_bank_details(db: AsyncSession, arena_id: uuid.UUID) -> list[ArenaBankDetails]:
    """All of an arena's bank accounts — default first, then newest."""
    result = await db.execute(
        select(ArenaBankDetails)
        .where(ArenaBankDetails.arena_id == arena_id)
        .order_by(ArenaBankDetails.is_default.desc(), ArenaBankDetails.created_at.desc())
    )
    return list(result.scalars().all())


async def list_active_bank_details(db: AsyncSession, arena_id: uuid.UUID) -> list[ArenaBankDetails]:
    """Active accounts only, default first — what a player sees at checkout."""
    result = await db.execute(
        select(ArenaBankDetails)
        .where(ArenaBankDetails.arena_id == arena_id, ArenaBankDetails.is_active.is_(True))
        .order_by(ArenaBankDetails.is_default.desc(), ArenaBankDetails.created_at.desc())
    )
    return list(result.scalars().all())


async def get_bank_details(db: AsyncSession, bank_details_id: uuid.UUID) -> ArenaBankDetails | None:
    return await db.get(ArenaBankDetails, bank_details_id)


async def add_bank_details(db: AsyncSession, details: ArenaBankDetails) -> ArenaBankDetails:
    db.add(details)
    await db.flush()
    return details


async def clear_default_bank_details(
    db: AsyncSession, arena_id: uuid.UUID, *, except_id: uuid.UUID | None = None
) -> None:
    """Unset ``is_default`` on every account of an arena except ``except_id``
    — used to keep at most one default per arena."""
    stmt = (
        update(ArenaBankDetails)
        .where(ArenaBankDetails.arena_id == arena_id, ArenaBankDetails.is_default.is_(True))
        .values(is_default=False)
    )
    if except_id is not None:
        stmt = stmt.where(ArenaBankDetails.id != except_id)
    await db.execute(stmt)
