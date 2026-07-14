"""Review endpoints.

* ``router`` — public arena reviews + rating summary; player submit/edit/
  delete; report/flag (any authenticated user).
* ``owner_router`` (``/owner``) — owner response to a review on their arena.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.review import service
from app.modules.review.schema import (
    OwnerResponseRequest,
    ReviewCreate,
    ReviewReportRequest,
    ReviewUpdate,
)
from app.modules.user.model import User
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, paginated, pagination_params
from app.shared.response import success

router = APIRouter(tags=["reviews"])
owner_router = APIRouter(prefix="/owner", tags=["reviews-owner"])

_owner = require_role("owner")


# ---- public discovery -----------------------------------------------------


@router.get("/arenas/{arena_id}/reviews", summary="List an arena's reviews")
async def list_arena_reviews(
    arena_id: uuid.UUID,
    params: PaginationParams = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    rows, total = await service.list_arena_reviews(
        db, arena_id, offset=params.offset, limit=params.page_size
    )
    return success(data=paginated(rows, total, params), message="Reviews retrieved.")


@router.get("/arenas/{arena_id}/reviews/summary", summary="Get an arena's rating summary")
async def get_rating_summary(
    arena_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    average, count = await service.get_rating_summary(db, arena_id)
    return success(
        data={"average_rating": average, "review_count": count}, message="Rating summary retrieved."
    )


# ---- player self-service ---------------------------------------------------


@router.post(
    "/arenas/{arena_id}/reviews",
    status_code=status.HTTP_201_CREATED,
    summary="Submit a review for a completed booking",
)
async def submit_review(
    arena_id: uuid.UUID,
    data: ReviewCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    review = await service.submit_review(db, user, arena_id, data)
    return success(data=review, message="Review submitted.")


@router.put("/reviews/{review_id}", summary="Edit my review")
async def update_review(
    review_id: uuid.UUID,
    data: ReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    review = await service.update_review(db, user, review_id, data)
    return success(data=review, message="Review updated.")


@router.delete("/reviews/{review_id}", summary="Delete a review (own, or admin)")
async def delete_review(
    review_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.delete_review(db, user, review_id)
    return success(message="Review deleted.")


@router.post("/reviews/{review_id}/report", summary="Report/flag a review")
async def report_review(
    review_id: uuid.UUID,
    data: ReviewReportRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    await service.report_review(db, user, review_id, data.reason)
    return success(message="Review reported.")


# ---- owner ------------------------------------------------------------------


@owner_router.post("/reviews/{review_id}/response", summary="Respond to a review on my arena")
async def respond_to_review(
    review_id: uuid.UUID,
    data: OwnerResponseRequest,
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    review = await service.respond_to_review(db, user, review_id, data.response_text)
    return success(data=review, message="Response added.")
