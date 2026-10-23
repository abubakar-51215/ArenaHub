"""Data access for arenas, amenities, blocked dates, and discount codes.

Repository layer: queries and inserts only, no business rules. Callers own the
transaction (commit in the service). Amenities are eager-loaded so response
serialization never triggers a lazy load on the async session.
"""

import math
import uuid
from collections.abc import Collection
from datetime import date, datetime
from decimal import Decimal
from typing import Any, NamedTuple, cast

from sqlalchemy import (
    ColumnElement,
    CursorResult,
    Float,
    Select,
    and_,
    exists,
    func,
    literal_column,
    or_,
    select,
    update,
)
from sqlalchemy import cast as sa_cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.time_of_day import BANDS, TimeOfDay
from app.modules.arena.model import (
    Amenity,
    Arena,
    ArenaBankDetails,
    ArenaBlockedDate,
    ArenaCity,
    ArenaLike,
    ArenaStatus,
    DiscountCode,
    arena_amenities,
)
from app.modules.booking.model import Booking, BookingStatus
from app.modules.court.model import Court, CourtPricingRule
from app.modules.review.model import Review
from app.modules.slot.model import SlotStatus, TimeSlot

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


def _review_summary() -> Any:
    """Per arena: average rating and count over non-flagged reviews."""
    return (
        select(
            Review.arena_id.label("arena_id"),
            func.avg(Review.rating).label("avg_rating"),
            func.count(Review.id).label("review_count"),
        )
        .where(Review.is_flagged.is_(False))
        .group_by(Review.arena_id)
        .subquery("review_summary")
    )


def _price_summary() -> Any:
    """Per arena: the "from" price, the lowest price a slot can be quoted at.

    Each available court's slot price is ``base_price`` times the lowest active
    pricing multiplier, capped at 1 (peak rules never lower a price below base,
    discount rules can). A court with no active rules keeps its base price.
    The arena's from-price is the lowest court price, rounded to 2 places.
    """
    rule_factor = func.least(
        literal_column("1"),
        func.coalesce(
            func.min(CourtPricingRule.price_multiplier).filter(
                CourtPricingRule.is_active.is_(True)
            ),
            literal_column("1"),
        ),
    )
    per_court = (
        select(Court.arena_id.label("arena_id"), (Court.base_price * rule_factor).label("price"))
        .select_from(Court)
        .outerjoin(CourtPricingRule, CourtPricingRule.court_id == Court.id)
        .where(Court.is_available.is_(True))
        .group_by(Court.id)
        .subquery("court_price")
    )
    return (
        select(
            per_court.c.arena_id.label("arena_id"),
            func.round(func.min(per_court.c.price), 2).label("min_price"),
        )
        .group_by(per_court.c.arena_id)
        .subquery("price_summary")
    )


class ArenaSummary(NamedTuple):
    avg_rating: float | None
    review_count: int
    min_price: Decimal | None


async def arena_summaries(
    db: AsyncSession, arena_ids: list[uuid.UUID]
) -> dict[uuid.UUID, ArenaSummary]:
    """Rating, review count and from-price for a page of arenas, in one query."""
    if not arena_ids:
        return {}
    reviews, prices = _review_summary(), _price_summary()
    result = await db.execute(
        select(Arena.id, reviews.c.avg_rating, reviews.c.review_count, prices.c.min_price)
        .outerjoin(reviews, reviews.c.arena_id == Arena.id)
        .outerjoin(prices, prices.c.arena_id == Arena.id)
        .where(Arena.id.in_(arena_ids))
    )
    return {
        row.id: ArenaSummary(
            avg_rating=round(float(row.avg_rating), 1) if row.avg_rating is not None else None,
            review_count=int(row.review_count or 0),
            min_price=row.min_price,
        )
        for row in result
    }


EARTH_RADIUS_KM = 6371.0


def distance_km_expr(lat: float, lon: float) -> Any:
    """Haversine distance in km from (lat, lon) to the arena's coordinates, as a SQL expression."""
    a_lat = func.radians(sa_cast(Arena.latitude, Float))
    a_lon = func.radians(sa_cast(Arena.longitude, Float))
    p_lat, p_lon = math.radians(lat), math.radians(lon)
    h = func.power(func.sin((a_lat - p_lat) / 2), 2) + (
        math.cos(p_lat) * func.cos(a_lat) * func.power(func.sin((a_lon - p_lon) / 2), 2)
    )
    return 2 * EARTH_RADIUS_KM * func.asin(func.sqrt(func.least(1.0, h)))


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """The same haversine formula in Python (the distance shown on a card)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (
        math.sin((p2 - p1) / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def _starts_in(band: TimeOfDay) -> ColumnElement[bool]:
    """A slot whose start time is in the part of the day (Night wraps past midnight)."""
    first, after = BANDS[band]
    if first < after:
        return and_(TimeSlot.start_time >= first, TimeSlot.start_time < after)
    return or_(TimeSlot.start_time >= first, TimeSlot.start_time < after)


def _has_free_slot(band: TimeOfDay, day: date, now: datetime) -> ColumnElement[bool]:
    """The arena has a slot a player could book on ``day`` in that part of the day: free, on a
    court that takes bookings, not on a day the arena blocked, and not already started."""
    return exists(
        select(TimeSlot.id)
        .join(Court, Court.id == TimeSlot.court_id)
        .where(
            Court.arena_id == Arena.id,
            Court.is_available.is_(True),
            TimeSlot.date == day,
            TimeSlot.status == SlotStatus.available,
            _starts_in(band),
            or_(TimeSlot.date > now.date(), TimeSlot.start_time > now.time()),
            ~exists(
                select(ArenaBlockedDate.id).where(
                    ArenaBlockedDate.arena_id == Arena.id,
                    ArenaBlockedDate.blocked_date == TimeSlot.date,
                )
            ),
        )
    )


async def list_amenities_in_use(db: AsyncSession) -> list[Amenity]:
    """The amenities at least one live arena has, A to Z: what the "Must have" filter can offer."""
    result = await db.execute(
        select(Amenity)
        .where(
            Amenity.id.in_(
                select(arena_amenities.c.amenity_id)
                .join(Arena, Arena.id == arena_amenities.c.arena_id)
                .where(*Arena.live_conditions())
            )
        )
        .order_by(Amenity.name.asc())
    )
    return list(result.scalars().all())


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
    near: tuple[float, float] | None = None,
    radius_km: float | None = None,
    area: str | None = None,
    only_ids: Collection[uuid.UUID] | None = None,
    amenity_ids: Collection[uuid.UUID] | None = None,
    time_of_day: TimeOfDay | None = None,
    day: date | None = None,
    now: datetime | None = None,
) -> tuple[list[Arena], int]:
    """Approved + active arenas only — the public discovery query.

    ``area`` (smart search's place) matches an arena whose area or address holds that text;
    ``only_ids`` keeps only those arenas (smart search's free-slot filter).

    ``amenity_ids`` keeps arenas that have ALL of those amenities; ``time_of_day`` keeps arenas
    with a free, bookable slot in that part of the day on ``day`` (``now`` is the Pakistan wall
    clock, used so a slot that has already started is not counted).

    ``price_min``/``price_max`` filter on each arena's cheapest court (a
    price-range slider filters "arenas with something in this range", not
    "every court is in this range"). ``sort`` supports ``newest`` (default),
    ``name``, ``price_asc``/``price_desc`` (by cheapest court), and
    ``rating_desc`` (by average review rating, unrated arenas sort last) and
    ``best`` (rating, then review count, then newest).
    """
    reviews, prices = _review_summary(), _price_summary()
    base = (
        select(Arena)
        .outerjoin(reviews, reviews.c.arena_id == Arena.id)
        .outerjoin(prices, prices.c.arena_id == Arena.id)
        .where(*Arena.live_conditions())
    )
    if q:
        like = f"%{q.lower()}%"
        base = base.where(func.lower(Arena.name).like(like))
    if city:
        base = base.where(Arena.city == city)
    if area:
        # a bound value inside LIKE: the text is never SQL; % and _ in it are taken literally
        like = "%" + area.lower().replace("\\", "").replace("%", "").replace("_", "") + "%"
        base = base.where(
            or_(func.lower(Arena.area).like(like), func.lower(Arena.address).like(like))
        )
    if only_ids is not None:
        base = base.where(Arena.id.in_(list(only_ids)))
    if sport:
        # sports_offered is a JSONB array of strings.
        base = base.where(Arena.sports_offered.contains([sport]))
    wanted = set(amenity_ids or ())
    if wanted:
        base = base.where(
            Arena.id.in_(
                select(arena_amenities.c.arena_id)
                .where(arena_amenities.c.amenity_id.in_(wanted))
                .group_by(arena_amenities.c.arena_id)
                .having(func.count(arena_amenities.c.amenity_id) == len(wanted))
            )
        )
    if time_of_day is not None and day is not None and now is not None:
        base = base.where(_has_free_slot(time_of_day, day, now))
    dist = distance_km_expr(*near) if near else None
    if dist is not None and radius_km is not None:
        # an arena with no coordinates is not shown when a radius is set
        base = base.where(
            Arena.latitude.is_not(None), Arena.longitude.is_not(None), dist <= radius_km
        )
    if price_min is not None:
        base = base.where(price_min <= prices.c.min_price)
    if price_max is not None:
        base = base.where(price_max >= prices.c.min_price)

    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0

    order: tuple[Any, ...]
    if sort == "near" and dist is not None:
        # arenas without coordinates sort last
        order = (dist.asc().nulls_last(), Arena.name.asc())
    elif sort == "name":
        order = (Arena.name.asc(),)
    elif sort == "price_asc":
        order = (prices.c.min_price.asc().nulls_last(),)
    elif sort == "price_desc":
        order = (prices.c.min_price.desc().nulls_last(),)
    elif sort == "rating_desc":
        order = (reviews.c.avg_rating.desc().nulls_last(),)
    elif sort == "best":
        # rating first, then how many people rated it, then the newest
        order = (
            reviews.c.avg_rating.desc().nulls_last(),
            reviews.c.review_count.desc().nulls_last(),
            Arena.created_at.desc(),
        )
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
            *Arena.live_conditions(),
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
    db: AsyncSession,
    status: ArenaStatus,
    *,
    offset: int,
    limit: int,
    suspended: bool | None = None,
) -> tuple[list[Arena], int]:
    """Admin verification queue, oldest-first (FIFO review order). Deleted
    arenas are never listed. ``suspended`` narrows to suspended arenas
    (True) or leaves them out (False); None lists both."""
    base = select(Arena).where(Arena.status == status, Arena.deleted_at.is_(None))
    if suspended is True:
        base = base.where(Arena.suspended_at.is_not(None))
    elif suspended is False:
        base = base.where(Arena.suspended_at.is_(None))
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


async def release_discount_usage(db: AsyncSession, discount_id: uuid.UUID) -> None:
    """Gives one use back (never below zero). The caller makes sure it runs once per booking."""
    await db.execute(
        update(DiscountCode)
        .where(DiscountCode.id == discount_id, DiscountCode.used_count > 0)
        .values(used_count=DiscountCode.used_count - 1)
    )


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
    """A player's liked arenas, most recently liked first. Arenas an admin
    has suspended or removed drop out of the list (the like row stays, so a
    reactivated arena comes back); an arena its owner merely took offline,
    or one that went back to review, stays listed."""
    base = (
        select(Arena)
        .join(ArenaLike, ArenaLike.arena_id == Arena.id)
        .where(
            ArenaLike.player_id == player_id,
            Arena.suspended_at.is_(None),
            Arena.deleted_at.is_(None),
        )
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
