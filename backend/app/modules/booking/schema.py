"""Pydantic request/response models for the booking module."""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.booking.model import BookingStatus, PaymentPlan, PaymentStatus

MAX_SLOTS_PER_BOOKING = 8


class EquipmentAddonRequest(BaseModel):
    equipment_id: uuid.UUID
    quantity: int = Field(ge=1)


class BookingCreateRequest(BaseModel):
    court_id: uuid.UUID
    slot_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_SLOTS_PER_BOOKING)
    payment_type: PaymentPlan
    discount_code: str | None = Field(default=None, max_length=50)
    # Attached to the first booking row in the group — see
    # modules/booking/service.py's create_booking docstring for why.
    equipment: list[EquipmentAddonRequest] = Field(default_factory=list)


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
    qr_code_url: str | None = None
    cancellation_reason: str | None = None
    refund_eligible: bool
    refund_percentage: int | None = None


class BookingGroupResponse(BaseModel):
    booking_group_id: uuid.UUID
    bookings: list[BookingResponse]
    # Server-authoritative price breakdown for the whole checkout, so the
    # client can show the player exactly how the total was reached (slots +
    # equipment − discount) instead of only an opaque final figure or a
    # client-side estimate. ``discount_amount`` is 0 when no code applied.
    slots_subtotal: Decimal
    equipment_total: Decimal
    discount_amount: Decimal
    total: Decimal
