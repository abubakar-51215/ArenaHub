"""Pydantic request/response models for the arena module.

Covers arena CRUD, operating hours, payment/refund config, amenities,
blocked dates, and per-arena discount codes. Owners create arenas in the
``pending`` state; the admin verification slice moves them to approved/rejected.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.modules.arena.model import ArenaCity, ArenaStatus, DiscountType

# ISO weekday keys accepted in operating_hours.
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


class DayHours(BaseModel):
    """Open/close for a single day, "HH:MM" 24-hour. Omit a day = closed."""

    open: str = Field(pattern=_TIME_RE)
    close: str = Field(pattern=_TIME_RE)

    @model_validator(mode="after")
    def _close_after_open(self) -> "DayHours":
        if self.close <= self.open:
            raise ValueError("close time must be after open time")
        return self


OperatingHours = dict[str, DayHours]


def _validate_operating_hours(value: dict) -> dict:
    bad = set(value) - set(_WEEKDAYS)
    if bad:
        raise ValueError(f"unknown weekday(s): {', '.join(sorted(bad))}")
    return value


class RefundTier(BaseModel):
    """Cancel ≥ ``hours_before`` hours ahead → refund ``refund_percentage``%."""

    hours_before: int = Field(ge=0, le=8760)
    refund_percentage: int = Field(ge=0, le=100)


Latitude = Annotated[Decimal, Field(ge=-90, le=90)]
Longitude = Annotated[Decimal, Field(ge=-180, le=180)]


class ArenaCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    address: str = Field(min_length=1)
    city: ArenaCity
    area: str | None = Field(default=None, max_length=100)
    latitude: Latitude
    longitude: Longitude
    contact_phone: str | None = Field(default=None, max_length=20)
    contact_email: EmailStr | None = None
    operating_hours: OperatingHours
    sports_offered: list[str] = Field(min_length=1)
    images: list[str] = Field(default_factory=list, max_length=20)
    amenity_ids: list[uuid.UUID] = Field(default_factory=list)
    advance_percentage: int = Field(default=100, ge=1, le=100)
    require_full_payment: bool = True
    refund_policy: list[RefundTier] = Field(default_factory=list)

    @field_validator("operating_hours")
    @classmethod
    def _hours(cls, v: dict) -> dict:
        return _validate_operating_hours(v)


class ArenaUpdate(BaseModel):
    """All fields optional — only provided fields are applied (PATCH semantics)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    address: str | None = Field(default=None, min_length=1)
    city: ArenaCity | None = None
    area: str | None = Field(default=None, max_length=100)
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    contact_phone: str | None = Field(default=None, max_length=20)
    contact_email: EmailStr | None = None
    operating_hours: OperatingHours | None = None
    sports_offered: list[str] | None = Field(default=None, min_length=1)
    images: list[str] | None = Field(default=None, max_length=20)
    amenity_ids: list[uuid.UUID] | None = None
    advance_percentage: int | None = Field(default=None, ge=1, le=100)
    require_full_payment: bool | None = None
    refund_policy: list[RefundTier] | None = None

    @field_validator("operating_hours")
    @classmethod
    def _hours(cls, v: dict | None) -> dict | None:
        return _validate_operating_hours(v) if v is not None else v


class AmenityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    icon: str | None = None


class ArenaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    description: str | None = None
    address: str
    city: ArenaCity
    area: str | None = None
    latitude: Decimal
    longitude: Decimal
    contact_phone: str | None = None
    contact_email: str | None = None
    operating_hours: dict
    sports_offered: list
    images: list
    status: ArenaStatus
    rejection_reason: str | None = None
    advance_percentage: int
    require_full_payment: bool
    refund_policy: list
    is_active: bool
    amenities: list[AmenityResponse] = Field(default_factory=list)
    created_at: datetime


class BlockedDateCreate(BaseModel):
    blocked_date: date
    reason: str | None = Field(default=None, max_length=255)


class BlockedDateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    arena_id: uuid.UUID
    blocked_date: date
    reason: str | None = None


class DiscountCodeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=255)
    discount_type: DiscountType
    discount_value: Decimal = Field(gt=0)
    min_booking_amount: Decimal = Field(default=Decimal("0"), ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def _check(self) -> "DiscountCodeCreate":
        if self.discount_type is DiscountType.percentage and self.discount_value > 100:
            raise ValueError("percentage discount cannot exceed 100")
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("valid_until must be after valid_from")
        return self


class DiscountCodeUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=255)
    discount_value: Decimal | None = Field(default=None, gt=0)
    min_booking_amount: Decimal | None = Field(default=None, ge=0)
    max_uses: int | None = Field(default=None, ge=1)
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool | None = None


class DiscountCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    arena_id: uuid.UUID
    code: str
    description: str | None = None
    discount_type: DiscountType
    discount_value: Decimal
    min_booking_amount: Decimal
    max_uses: int | None = None
    used_count: int
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_active: bool


class ArenaBankDetailsCreate(BaseModel):
    """Owner adds one bank-transfer receiving account to an arena. An arena
    may hold several; ``is_default`` marks the one preferred at checkout
    (setting it unsets any other default)."""

    label: str | None = Field(default=None, max_length=100)
    bank_name: str = Field(min_length=1, max_length=100)
    account_title: str = Field(min_length=1, max_length=150)
    account_number: str = Field(min_length=1, max_length=50)
    iban: str | None = Field(default=None, max_length=50)
    branch_code: str | None = Field(default=None, max_length=30)
    swift_code: str | None = Field(default=None, max_length=30)
    payment_instructions: str | None = Field(default=None, max_length=1000)
    is_default: bool = False
    is_active: bool = True


class ArenaBankDetailsUpdate(BaseModel):
    """PATCH one account — only provided fields change."""

    label: str | None = Field(default=None, max_length=100)
    bank_name: str | None = Field(default=None, min_length=1, max_length=100)
    account_title: str | None = Field(default=None, min_length=1, max_length=150)
    account_number: str | None = Field(default=None, min_length=1, max_length=50)
    iban: str | None = Field(default=None, max_length=50)
    branch_code: str | None = Field(default=None, max_length=30)
    swift_code: str | None = Field(default=None, max_length=30)
    payment_instructions: str | None = Field(default=None, max_length=1000)
    is_default: bool | None = None
    is_active: bool | None = None


class ArenaBankDetailsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    arena_id: uuid.UUID
    label: str | None = None
    bank_name: str
    account_title: str
    account_number: str
    iban: str | None = None
    branch_code: str | None = None
    swift_code: str | None = None
    payment_instructions: str | None = None
    is_default: bool
    is_active: bool


class ArenaSearchParams(BaseModel):
    """Public arena search/filter (approved + active only)."""

    q: str | None = None
    city: ArenaCity | None = None
    sport: str | None = None
    sort: Literal["newest", "name"] = "newest"
