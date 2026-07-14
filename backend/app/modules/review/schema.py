"""Pydantic request/response models for the review module."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    booking_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=2000)


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    review_text: str | None = Field(default=None, max_length=2000)


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


class RatingSummaryResponse(BaseModel):
    average_rating: float | None = None
    review_count: int
