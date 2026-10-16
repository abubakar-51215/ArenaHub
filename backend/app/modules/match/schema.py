"""Pydantic request/response models for the match module."""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, Field

from app.modules.match.model import MatchStatus
from app.shared.request_model import RequestModel


class MatchCreate(RequestModel):
    """A match on one of my own upcoming confirmed bookings."""

    booking_group_id: uuid.UUID
    sport: str = Field(min_length=1, max_length=50)
    max_players: int = Field(ge=2, le=50)
    note: str | None = Field(default=None, max_length=200)


class ParticipantResponse(BaseModel):
    player_id: uuid.UUID
    player_name: str
    joined_at: datetime


class MatchResponse(BaseModel):
    id: uuid.UUID
    creator_id: uuid.UUID
    creator_name: str
    arena_id: uuid.UUID
    arena_name: str
    city: str
    court_id: uuid.UUID
    court_name: str
    sport: str
    match_date: date
    start_time: time
    end_time: time
    max_players: int
    players_joined: int
    status: MatchStatus
    created_at: datetime
    booking_group_id: uuid.UUID | None = None
    note: str | None = None
    # what the creator's booking costs in all; the phone shows "about X each" (text only,
    # nothing is paid in the app)
    booking_total: Decimal | None = None
    # did the player who asked join (or create) this match
    joined_by_me: bool = False


class MatchDetailResponse(MatchResponse):
    participants: list[ParticipantResponse]
