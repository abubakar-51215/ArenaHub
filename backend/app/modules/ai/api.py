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
from app.shared.auth import get_current_user
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(tags=["ai"])


@router.get("/search/nlp", summary="Free-text arena search (keyword-parsed)")
async def nlp_search(
    q: str = Query(min_length=1),
    params: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.nlp_search(db, q, params)
    return success(data=data, message="Search results retrieved.")


@router.get("/recommendations", summary="Personalized arena recommendations")
async def recommendations(
    city: ArenaCity | None = None,
    sport: str | None = None,
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    items = await service.recommend_arenas(db, user, city=city, sport=sport, limit=limit)
    return success(data={"items": items}, message="Recommendations retrieved.")
