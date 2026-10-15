"""AI/NLP search + recommendation endpoints (docs/12_AI_RECOMMENDATION_MODULE.md).

Both are public-search-shaped: NLP search has no auth requirement (mirrors
``GET /arenas``); recommendations are personalized so they require a logged
-in player.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.ai import service
from app.modules.arena.model import ArenaCity
from app.modules.user.model import User
from app.shared import abuse
from app.shared.auth import get_current_user
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(tags=["ai"])


@router.get(
    "/search/nlp",
    summary="Smart search: plain words understood, applied and echoed",
    dependencies=[Depends(abuse.per_address("nlp", 120, 600))],
)
async def nlp_search(
    # longer text is cut to 120 characters by the parser, never refused
    q: str = Query(min_length=1, max_length=1000),
    drop: list[str] = Query(default=[], max_length=10, description="Chip kinds the player removed"),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    params: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    near = (lat, lon) if lat is not None and lon is not None else None
    data = await service.nlp_search(db, q, params, drop=drop, near=near)
    return success(data=data, message="Search results retrieved.")


@router.get("/recommendations", summary="Personalized arena recommendations")
async def recommendations(
    city: ArenaCity | None = None,
    sport: str | None = Query(None, max_length=50),
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    items = await service.recommend_arenas(db, user, city=city, sport=sport, limit=limit)
    return success(data={"items": items}, message="Recommendations retrieved.")
