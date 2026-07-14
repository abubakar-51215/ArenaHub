"""Data access for arenas, amenities, blocked dates, and discount codes.

Repository layer: queries and inserts only, no business rules. Callers own the
transaction (commit in the service). Amenities are eager-loaded so response
serialization never triggers a lazy load on the async session.
"""

import uuid
from decimal import Decimal

from sqlalchemy import Select, UnaryExpression, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.arena.model import (
    Amenity,
    Arena,
    ArenaBlockedDate,
    ArenaCity,
    ArenaStatus,
    DiscountCode,
)
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

    result = await db.execute(
        _with_amenities(base).order_by(*order).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


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
