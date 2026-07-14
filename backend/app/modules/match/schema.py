"""Pydantic request/response models for the match module."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.modules.match.model import MatchStatus


class MatchCreate(BaseModel):
    arena_id: uuid.UUID
    court_id: uuid.UUID
    sport: str = Field(min_length=1, max_length=50)
    match_date: date
    start_time: time
    end_time: time
    max_players: int = Field(ge=2, le=50)


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


class MatchDetailResponse(MatchResponse):
    participants: list[ParticipantResponse]
