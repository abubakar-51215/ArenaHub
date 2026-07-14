"""Match ("Play") endpoints — all authenticated. Lightweight social listing,
not integrated with slot locking or payment (see modules/match/model.py).
"""

import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.arena.model import ArenaCity
from app.modules.match import service
from app.modules.match.schema import MatchCreate
from app.modules.user.model import User
from app.shared.auth import get_current_user
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/matches", tags=["matches"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a match")
async def create_match(
    data: MatchCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    match = await service.create_match(db, user, data)
    return success(data=match, message="Match created.")


@router.get("", summary="List open matches")
async def list_open_matches(
    city: ArenaCity | None = None,
    sport: str | None = None,
    match_date: date | None = Query(default=None, alias="date"),
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_open_matches(
        db, city=city, sport=sport, match_date=match_date, params=params
    )
    return success(data=data, message="Matches retrieved.")


@router.get("/mine", summary="My created + joined matches")
async def list_my_matches(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_my_matches(db, user)
    return success(data=data, message="Matches retrieved.")


@router.get("/{match_id}", summary="Get a match's detail incl. participants")
async def get_match(
    match_id: uuid.UUID,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    match = await service.get_match_detail(db, match_id)
    return success(data=match, message="Match retrieved.")


@router.post("/{match_id}/join", summary="Join a match")
async def join_match(
    match_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    match = await service.join_match(db, user, match_id)
    return success(data=match, message="Joined match.")


@router.post("/{match_id}/leave", summary="Leave a match (creator leaving cancels it)")
async def leave_match(
    match_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.leave_match(db, user, match_id)
    return success(message="Left match.")


@router.delete("/{match_id}", summary="Cancel a match (creator only)")
async def cancel_match(
    match_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.cancel_match(db, user, match_id)
    return success(message="Match cancelled.")
