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


class BookingPreviewRequest(BaseModel):
    court_id: uuid.UUID
    slot_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_SLOTS_PER_BOOKING)
    discount_code: str | None = Field(default=None, max_length=50)
    equipment: list[EquipmentAddonRequest] = Field(default_factory=list)


class BookingPreviewResponse(BaseModel):
    """The price a booking would have, with nothing reserved. ``pay_now`` is
    what the first payment asks for; ``due_at_arena`` is the rest (0 when the
    arena takes full payment). ``discount_status`` is none, applied or refused."""

    slots_subtotal: Decimal
    equipment_total: Decimal
    discount_amount: Decimal
    total: Decimal
    payment_type: PaymentPlan
    pay_now: Decimal
    due_at_arena: Decimal
    discount_status: str
    discount_message: str | None = None
    cancellation_note: str


class BookingGroupDetails(BaseModel):
    """One booking group with the names and money a confirmation screen needs."""

    booking_group_id: uuid.UUID
    arena_id: uuid.UUID
    arena_name: str
    arena_address: str
    court_id: uuid.UUID
    court_name: str
    booking_date: date
    start_time: time
    end_time: time
    slot_count: int
    status: BookingStatus
    payment_status: PaymentStatus
    payment_type: PaymentPlan
    total: Decimal
    pay_now: Decimal
    due_at_arena: Decimal
    payment_id: uuid.UUID | None = None
    payment_method: str | None = None
    payment_lifecycle: str | None = None
    booking_code: str
    cancellation_note: str
    booking_ids: list[uuid.UUID]
    slot_ids: list[uuid.UUID] = Field(default_factory=list)
    # what was refunded (or is on its way) for a cancelled group
    refund_amount: Decimal = Decimal("0")
    refund_status: str | None = None
    can_cancel: bool = False
    can_reschedule: bool = False


class CancelPreview(BaseModel):
    """What cancelling this group now would do: the refund from the arena policy."""

    can_cancel: bool
    paid: Decimal
    refund_percentage: int
    refund_amount: Decimal
    policy_text: str


class GroupRescheduleRequest(BaseModel):
    new_slot_ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_SLOTS_PER_BOOKING)


class ReschedulePreview(BaseModel):
    """The price of moving a group to new times, nothing changed yet. ``balance`` is
    what is still to pay at the arena; ``refund`` is what goes back to the player."""

    old_total: Decimal
    new_total: Decimal
    paid: Decimal
    balance: Decimal
    refund: Decimal


class BookingGroupListItem(BaseModel):
    """One card of My bookings: a whole booking group."""

    booking_group_id: uuid.UUID
    booking_code: str
    arena_id: uuid.UUID
    arena_name: str
    arena_photo: str | None = None
    court_id: uuid.UUID
    court_name: str
    sport: str | None = None
    booking_date: date
    start_time: time
    end_time: time
    slot_count: int
    status: BookingStatus
    payment_status: PaymentStatus
    total: Decimal
    pay_now: Decimal
    due_at_arena: Decimal
    refund_amount: Decimal
    refund_status: str | None = None
    tab: str
    # for Rate this game: one booking of the group, and the stars already given (None = not rated)
    booking_id: uuid.UUID
    my_rating: int | None = None
