"""Pydantic request/response models for the equipment module."""

import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.shared.request_model import RequestModel


class EquipmentCreate(RequestModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    rental_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    quantity_total: int = Field(ge=1)
    is_active: bool = True


class EquipmentUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    rental_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    is_active: bool | None = None


class QuantityAdjust(RequestModel):
    """Change total stock by ``delta`` (e.g. +5 bought more, -2 retired some).

    Kept separate from ``EquipmentUpdate`` because it must move
    ``quantity_available`` in lockstep with ``quantity_total`` — a plain
    field edit could silently desync the two.
    """

    delta: int = Field(ge=-100000, le=100000)

    @model_validator(mode="after")
    def _nonzero(self) -> "QuantityAdjust":
        if self.delta == 0:
            raise ValueError("delta must not be zero")
        return self


class EquipmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    arena_id: uuid.UUID
    name: str
    description: str | None = None
    rental_price: Decimal
    quantity_total: int
    quantity_available: int
    is_active: bool
