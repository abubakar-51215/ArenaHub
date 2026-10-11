"""Pydantic request/response models for the review module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    booking_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=500)


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=500)


class ReviewReportRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class OwnerResponseRequest(BaseModel):
    response_text: str = Field(min_length=1, max_length=2000)


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_id: uuid.UUID
    reviewer_name: str
    arena_id: uuid.UUID
    booking_id: uuid.UUID
    rating: int
    review_text: str | None = None
    owner_response: str | None = None
    owner_response_at: datetime | None = None
    is_flagged: bool
    created_at: datetime
    updated_at: datetime


class MyReviewResponse(ReviewResponse):
    """One of the player's own reviews, with the arena it is about."""

    arena_name: str


class RatingSummaryResponse(BaseModel):
    average_rating: float | None = None
    review_count: int
    # how many reviews gave 1, 2, 3, 4 and 5 stars (the bars on the reviews screen)
    breakdown: list[int] = [0, 0, 0, 0, 0]


class ModerationReviewResponse(BaseModel):
    """One row in the admin moderation queue: the flagged review plus the
    names an admin needs to judge it without opening three other screens."""

    id: uuid.UUID
    arena_id: uuid.UUID
    arena_name: str
    reviewer_name: str
    rating: int
    review_text: str | None = None
    flag_reason: str | None = None
    reporter_name: str | None = None
    flagged_at: datetime | None = None
    created_at: datetime
