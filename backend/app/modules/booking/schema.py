"""Pydantic request/response models for the booking module."""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.booking.model import BookingStatus, PaymentPlan, PaymentStatus

MAX_SLOTS_PER_BOOKING = 8


class BookingCreateRequest(BaseModel):
    court_id: uuid.UUID
    slot_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_SLOTS_PER_BOOKING)
    payment_type: PaymentPlan
    discount_code: str | None = Field(default=None, max_length=50)


class RescheduleRequest(BaseModel):
    new_slot_id: uuid.UUID


class CancelRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    player_id: uuid.UUID
    arena_id: uuid.UUID
    court_id: uuid.UUID
    slot_id: uuid.UUID
    booking_group_id: uuid.UUID
    booking_date: date
    start_time: time
    end_time: time
    total_amount: Decimal
    advance_amount: Decimal
    remaining_amount: Decimal
    payment_type: PaymentPlan
    status: BookingStatus
    payment_status: PaymentStatus
    cancellation_reason: str | None = None
    refund_eligible: bool
    refund_percentage: int | None = None


class BookingGroupResponse(BaseModel):
    booking_group_id: uuid.UUID
    bookings: list[BookingResponse]
