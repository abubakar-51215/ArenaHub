"""Pydantic request/response models for the slot module."""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.slot.model import SlotStatus

MAX_GENERATE_DAYS = 30


class SlotGenerateRequest(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _range_is_sane(self) -> "SlotGenerateRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days >= MAX_GENERATE_DAYS:
            raise ValueError(f"Cannot generate more than {MAX_GENERATE_DAYS} days at once")
        return self


class SlotGenerateResult(BaseModel):
    created: int
    skipped_existing: int
    skipped_closed_or_blocked: list[date]
    # A day the arena is open on (not blocked/closed) but whose operating
    # window is shorter than one slot, so it produced zero slots — distinct
    # from skipped_closed_or_blocked so an owner isn't left wondering why a
    # seemingly-open day generated nothing.
    skipped_window_too_short: list[date] = []


class SlotUpdate(BaseModel):
    status: SlotStatus | None = None
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)


class SlotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    court_id: uuid.UUID
    date: date
    start_time: time
    end_time: time
    status: SlotStatus
    price: Decimal
