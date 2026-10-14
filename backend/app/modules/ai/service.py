"""Keyword-based NLP search + content-based arena recommendations
(docs/12_AI_RECOMMENDATION_MODULE.md).

Deliberately not ML: §4 of the doc rules out models/training/collaborative
filtering — this is dictionary keyword-matching for search and a weighted
arithmetic score for recommendations, both computed server-side in plain
Python over data the app already has (no new tables).
"""

import uuid
from collections.abc import Collection
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai import parser
from app.modules.ai.schema import ParsedQuery
from app.modules.arena import repository as arena_repo
from app.modules.arena import service as arena_service
from app.modules.arena.model import Arena, ArenaBlockedDate, ArenaCity
from app.modules.arena.schema import ArenaListItem
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import BookingStatus
from app.modules.court.model import Court
from app.modules.review.model import Review
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User
from app.shared.pagination import PaginationParams
from app.shared.timezone import PLATFORM_TZ

# ---- §2 NLP search --------------------------------------------------------
# The parser itself is plain Python in ``parser.py`` (rules only, fully tested). Here its result is
# applied: sport, city or area, price per hour, order, near me, and the free slots in the asked
# day and hours (an arena with no free slot then is not shown).

CHIP_KINDS = ("sport", "place", "time", "price", "sort", "near")
_SORT_FOR_REPO = {"best": "best", "price_asc": "price_asc", "price_desc": "price_desc"}


async def _places(db: AsyncSession) -> list[parser.Place]:
    """The areas of the live arenas (the place names smart search knows), plus the cities."""
    rows = await db.execute(
        select(Arena.area).where(*Arena.live_conditions(), Arena.area.is_not(None)).distinct()
    )
    return parser.places_from_areas([a for (a,) in rows.all() if a])


def _karachi_now() -> datetime:
    return datetime.now(PLATFORM_TZ).replace(tzinfo=None)


async def _free_slots(
    db: AsyncSession, window: parser.TimeWindow, now: datetime
) -> dict[uuid.UUID, int]:
    """arena id -> open slots that start inside the window (not started yet, not on a day
    the arena blocked, on a court that takes bookings)."""
    conditions = [
        TimeSlot.status == SlotStatus.available,
        TimeSlot.date >= window.first_day,
        TimeSlot.date <= window.last_day,
        TimeSlot.start_time >= window.start,
        or_(TimeSlot.date > now.date(), TimeSlot.start_time > now.time()),
        Court.is_available.is_(True),
        ~select(ArenaBlockedDate.id)
        .where(
            ArenaBlockedDate.arena_id == Court.arena_id,
            ArenaBlockedDate.blocked_date == TimeSlot.date,
        )
        .exists(),
    ]
    if window.end is not None:
        conditions.append(TimeSlot.start_time < window.end)
    stmt = (
        select(Court.arena_id, func.count(TimeSlot.id))
        .join(Court, Court.id == TimeSlot.court_id)
        .where(*conditions)
        .group_by(Court.arena_id)
    )
    return {aid: int(n) for aid, n in (await db.execute(stmt)).all()}


def _slot_words(n: int, window: parser.TimeWindow) -> str:
    when = window.label[0].lower() + window.label[1:]
    return f"{n} {'slot' if n == 1 else 'slots'} {when}"


async def nlp_search(
    db: AsyncSession,
    query_text: str,
    params: PaginationParams,
    *,
    drop: Collection[str] = (),
    near: tuple[float, float] | None = None,
) -> dict:
    """Parse the words, apply what was understood, and say what that was (the chips). A chip the
    player removed comes back in ``drop`` and is left out. Nothing understood: the words are
    searched as an arena name (``used_fallback_text_search``)."""
    now = _karachi_now()
    parsed = parser.parse(query_text, places=await _places(db), now=now)
    fallback = not parsed.understood
    dropped = set(drop) & set(CHIP_KINDS)
    if "sport" in dropped:
        parsed.sport = None
    if "place" in dropped:
        parsed.place = None
    if "time" in dropped:
        parsed.time = None
    if "price" in dropped:
        parsed.price_max = None
    if "sort" in dropped:
        parsed.sort = None
    if "near" in dropped:
        parsed.near = False

    sort = "newest"
    if parsed.near and near is not None:
        sort = "near"
    elif parsed.sort:
        sort = _SORT_FOR_REPO[parsed.sort]

    slots: dict[uuid.UUID, int] | None = None
    if parsed.time is not None:
        slots = await _free_slots(db, parsed.time, now)

    place = parsed.place
    arenas, total = await arena_repo.search_public_arenas(
        db,
        q=parsed.text if fallback else None,
        city=ArenaCity(place.city) if place and place.city else None,
        area=place.area if place and not place.city else None,
        sport=parsed.sport,
        price_max=Decimal(parsed.price_max) if parsed.price_max else None,
        sort=sort,
        near=near,
        only_ids=set(slots) if slots is not None else None,
        offset=params.offset,
        limit=params.page_size,
    )
    items = await arena_service.list_items(db, arenas)
    rows = []
    for item in items:
        row = item.model_dump(mode="json")
        n = slots.get(item.id) if slots is not None else None
        row["free_slots"] = n
        row["free_slots_text"] = _slot_words(n, parsed.time) if n and parsed.time else None
        rows.append(row)
    return {
        "parsed": ParsedQuery(
            text=parsed.text,
            sport=parsed.sport,
            city=place.city if place else None,
            area=place.area if place and not place.city else None,
            price_max=parsed.price_max,
            sort=sort,
            time_reference=parsed.time.label if parsed.time else None,
            near=parsed.near,
            chips=[] if fallback else parsed.chips(),
            used_fallback_text_search=fallback,
        ),
        "items": rows,
        "total": total,
    }


# ---- §3 Content-based recommendations -------------------------------------

_CANDIDATE_POOL_SIZE = 100
_WEIGHTS = {
    "proximity": Decimal("0.3"),
    "sport_match": Decimal("0.3"),
    "history": Decimal("0.2"),
    "rating": Decimal("0.1"),
    "price_fit": Decimal("0.1"),
}


def _sport_match_score(player_sports: list[str], arena_sports: list[str]) -> float:
    if not player_sports:
        return 0.5  # no stated preference — neither reward nor penalize
    p, a = set(player_sports), set(arena_sports)
    union = p | a
    if not union:
        return 0.5
    return len(p & a) / len(union)


def _proximity_score(player_locations: list[str], arena_city: str) -> float:
    if not player_locations:
        return 0.5
    return 1.0 if arena_city in player_locations else 0.0


def _history_score(
    booked_arena_ids: set[uuid.UUID], booked_sports: set[str], arena: Arena
) -> float:
    if arena.id in booked_arena_ids:
        return 1.0
    if booked_sports and booked_sports.intersection(arena.sports_offered):
        return 0.5
    return 0.0


def _rating_score(avg_rating: float | None) -> float:
    return (avg_rating or 0.0) / 5.0


def _price_fit_score(player_avg_spend: float | None, arena_avg_price: float | None) -> float:
    if player_avg_spend is None or arena_avg_price is None:
        return 0.5
    denom = max(player_avg_spend, arena_avg_price, 1.0)
    return max(0.0, 1.0 - abs(player_avg_spend - arena_avg_price) / denom)


async def _avg_prices_by_arena(
    db: AsyncSession, arena_ids: list[uuid.UUID]
) -> dict[uuid.UUID, float]:
    if not arena_ids:
        return {}
    rows = await db.execute(
        select(Court.arena_id, func.avg(Court.base_price))
        .where(Court.arena_id.in_(arena_ids))
        .group_by(Court.arena_id)
    )
    return {arena_id: float(avg) for arena_id, avg in rows.all()}


async def _avg_ratings_by_arena(
    db: AsyncSession, arena_ids: list[uuid.UUID]
) -> dict[uuid.UUID, float]:
    if not arena_ids:
        return {}
    rows = await db.execute(
        select(Review.arena_id, func.avg(Review.rating))
        .where(Review.arena_id.in_(arena_ids))
        .group_by(Review.arena_id)
    )
    return {arena_id: float(avg) for arena_id, avg in rows.all()}


async def recommend_arenas(
    db: AsyncSession,
    player: User,
    *,
    city: ArenaCity | None = None,
    sport: str | None = None,
    limit: int = 10,
) -> list[ArenaListItem]:
    """Top-``limit`` arenas for ``player`` by the weighted content-based
    score from docs/12 §3. ``city``/``sport`` narrow the candidate pool —
    used as-is for Home's "Recommended for You", and scoped to a specific
    city/sport for the "fully booked → nearby alternatives" case."""
    candidates, _ = await arena_repo.search_public_arenas(
        db,
        q=None,
        city=city,
        sport=sport,
        sort="newest",
        offset=0,
        limit=_CANDIDATE_POOL_SIZE,
    )
    if not candidates:
        return []

    player_bookings, _ = await booking_repo.list_player_bookings(
        db, player.id, status=None, offset=0, limit=200
    )
    booked_arena_ids = {b.arena_id for b in player_bookings}
    completed = [b for b in player_bookings if b.status == BookingStatus.completed]
    player_avg_spend = (
        sum(float(b.total_amount) for b in completed) / len(completed) if completed else None
    )

    # Sport isn't denormalized on Booking — look up the booked courts' own
    # sport_types to build the "sports this player has actually played" set.
    booked_court_ids = {b.court_id for b in completed}
    booked_sports: set[str] = set()
    if booked_court_ids:
        rows = await db.execute(select(Court.sport_types).where(Court.id.in_(booked_court_ids)))
        for (sport_types,) in rows.all():
            booked_sports.update(sport_types)

    candidate_ids = [a.id for a in candidates]
    avg_prices = await _avg_prices_by_arena(db, candidate_ids)
    avg_ratings = await _avg_ratings_by_arena(db, candidate_ids)

    scored = []
    for arena in candidates:
        score = (
            float(_WEIGHTS["proximity"])
            * _proximity_score(player.preferred_locations, arena.city.value)
            + float(_WEIGHTS["sport_match"])
            * _sport_match_score(player.preferred_sports, arena.sports_offered)
            + float(_WEIGHTS["history"]) * _history_score(booked_arena_ids, booked_sports, arena)
            + float(_WEIGHTS["rating"]) * _rating_score(avg_ratings.get(arena.id))
            + float(_WEIGHTS["price_fit"])
            * _price_fit_score(player_avg_spend, avg_prices.get(arena.id))
        )
        scored.append((score, arena))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return await arena_service.list_items(db, [a for _, a in scored[:limit]])
