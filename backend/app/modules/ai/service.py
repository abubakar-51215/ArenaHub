"""Keyword-based NLP search + content-based arena recommendations
(docs/12_AI_RECOMMENDATION_MODULE.md).

Deliberately not ML: §4 of the doc rules out models/training/collaborative
filtering — this is dictionary keyword-matching for search and a weighted
arithmetic score for recommendations, both computed server-side in plain
Python over data the app already has (no new tables).
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.schema import ParsedQuery
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena, ArenaCity
from app.modules.arena.schema import ArenaResponse
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import BookingStatus
from app.modules.court.model import Court
from app.modules.review.model import Review
from app.modules.user.model import User
from app.shared.pagination import PaginationParams

# ---- §2 NLP search --------------------------------------------------------

SPORT_KEYWORDS = [
    "cricket",
    "football",
    "futsal",
    "badminton",
    "tennis",
    "basketball",
    "volleyball",
]
# Our seeded taxonomy uses "futsal" rather than "football" for 5-a-side —
# normalize so a query like "football arena" still matches real data.
_SPORT_ALIASES = {"football": "futsal"}

CHEAP_KEYWORDS = ["cheap", "affordable", "budget", "inexpensive", "low price", "low cost"]
EXPENSIVE_KEYWORDS = ["expensive", "premium", "luxury", "high end"]
RATING_KEYWORDS = ["best", "highest rated", "top rated", "top"]
# Recognized so the UI can echo back what it understood; arenas aren't
# themselves date-scoped (only their slots are), so this doesn't filter the
# arena-level query — it's surfaced for a future slot-aware search pass.
TIME_KEYWORDS = ["tonight", "today", "tomorrow", "this weekend", "weekend"]


def parse_search_query(text: str) -> ParsedQuery:
    lowered = text.lower()

    sport = next((s for s in SPORT_KEYWORDS if s in lowered), None)
    if sport:
        sport = _SPORT_ALIASES.get(sport, sport)

    sort = "newest"
    if any(k in lowered for k in CHEAP_KEYWORDS):
        sort = "price_asc"
    elif any(k in lowered for k in EXPENSIVE_KEYWORDS):
        sort = "price_desc"
    elif any(k in lowered for k in RATING_KEYWORDS):
        sort = "rating_desc"

    city = next((c.value for c in ArenaCity if c.value.lower() in lowered), None)
    time_reference = next((k for k in TIME_KEYWORDS if k in lowered), None)

    matched_structured_params = bool(sport or city or sort != "newest")
    return ParsedQuery(
        sport=sport,
        city=city,
        sort=sort,
        time_reference=time_reference,
        used_fallback_text_search=not matched_structured_params,
    )


async def nlp_search(db: AsyncSession, query_text: str, params: PaginationParams) -> dict:
    """Parse a free-text query into structured params and run the existing
    arena search with them; falls back to a plain text search when nothing
    meaningful was extracted (§2's documented fallback path)."""
    parsed = parse_search_query(query_text)
    city = ArenaCity(parsed.city) if parsed.city else None
    q = query_text if parsed.used_fallback_text_search else None

    arenas, total = await arena_repo.search_public_arenas(
        db,
        q=q,
        city=city,
        sport=parsed.sport,
        sort=parsed.sort,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [ArenaResponse.model_validate(a) for a in arenas]
    return {"parsed": parsed, "items": items, "total": total}


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
) -> list[ArenaResponse]:
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
    return [ArenaResponse.model_validate(a) for _, a in scored[:limit]]
