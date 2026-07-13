"""Pydantic models for the admin verification slice."""

from pydantic import BaseModel, Field


class RejectArenaRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)
