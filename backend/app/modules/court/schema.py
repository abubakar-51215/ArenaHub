"""Pydantic request/response models for the court module.

Courts belong to an arena; base pricing lives on the court and peak-pricing
windows are ``CourtPricingRule`` rows (day + time window → multiplier).
"""

import uuid
from datetime import time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.court.model import Weekday


class CourtCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sport_types: list[str] = Field(min_length=1)
    capacity: int | None = Field(default=None, ge=1)
    base_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    images: list[str] = Field(default_factory=list, max_length=20)
    is_available: bool = True


class CourtUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    sport_types: list[str] | None = Field(default=None, min_length=1)
    capacity: int | None = Field(default=None, ge=1)
    base_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    images: list[str] | None = Field(default=None, max_length=20)
    is_available: bool | None = None


class AvailabilityUpdate(BaseModel):
    is_available: bool


class CourtResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    arena_id: uuid.UUID
    name: str
    description: str | None = None
    sport_types: list
    capacity: int | None = None
    base_price: Decimal
    images: list
    is_available: bool


class PricingRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    weekday: Weekday | None = None  # null = every day
    start_time: time
    end_time: time
    price_multiplier: Decimal = Field(gt=0, max_digits=4, decimal_places=2)
    is_active: bool = True

    @model_validator(mode="after")
    def _end_after_start(self) -> "PricingRuleCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class PricingRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    weekday: Weekday | None = None
    start_time: time | None = None
    end_time: time | None = None
    price_multiplier: Decimal | None = Field(default=None, gt=0, max_digits=4, decimal_places=2)
    is_active: bool | None = None


class PricingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    court_id: uuid.UUID
    name: str
    weekday: int | None = None
    start_time: time
    end_time: time
    price_multiplier: Decimal
    is_active: bool
