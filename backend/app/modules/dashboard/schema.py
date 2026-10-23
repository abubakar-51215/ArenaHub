"""Pydantic response models for the owner dashboard.

Purely a read-side composition module — no table of its own, so every field
here is derived from bookings/payments/arenas at request time.
"""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.booking.model import BookingStatus
from app.modules.payment.model import PaymentLifecycleStatus, PaymentMethod, PaymentStatus
from app.shared.receipt_links import ReceiptLink


class DashboardSummaryResponse(BaseModel):
    total_arenas: int
    bookings_today: int
    bookings_this_month: int
    monthly_revenue: Decimal
    pending_approvals: int


class PendingApprovalItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_id: uuid.UUID
    arena_id: uuid.UUID
    arena_name: str
    court_id: uuid.UUID
    player_id: uuid.UUID
    player_name: str
    booking_date: date
    start_time: time
    end_time: time
    total_amount: Decimal
    payment_id: uuid.UUID | None = None
    payment_method: str | None = None
    receipt_proof_url: ReceiptLink = None
    # "balance" when the receipt pays what was still owed on a confirmed booking (the booking
    # itself is already confirmed); "booking" for a first payment. payment_amount is the receipt's.
    purpose: str = "booking"
    payment_amount: Decimal | None = None


class BookingReminderResponse(BaseModel):
    player_name: str
    # a new reminder is possible after this many minutes
    next_reminder_in_minutes: int


class CalendarBookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    court_id: uuid.UUID
    player_id: uuid.UUID
    booking_date: date
    start_time: time
    end_time: time
    status: BookingStatus
    total_amount: Decimal


class RevenueBreakdownItem(BaseModel):
    id: uuid.UUID
    amount: Decimal


class RevenueSummaryResponse(BaseModel):
    total_revenue: Decimal
    pending_settlements: Decimal
    breakdown_by_arena: list[RevenueBreakdownItem]
    breakdown_by_court: list[RevenueBreakdownItem]


class RevenueTrendPoint(BaseModel):
    date: date
    amount: Decimal


class BookingsByHourPoint(BaseModel):
    hour: int
    count: int


class PeakHours(BaseModel):
    """The consecutive 3-hour window with the most bookings, 24h start hours."""

    start_hour: int
    end_hour: int


class TopArenaItem(BaseModel):
    arena_id: uuid.UUID
    name: str
    revenue: Decimal


class RecentBookingItem(BaseModel):
    booking_id: uuid.UUID
    booking_date: date
    start_time: time
    end_time: time
    court_name: str
    arena_name: str
    status: BookingStatus


class DashboardAnalyticsResponse(BaseModel):
    """Everything the dashboard home screen renders (design/wireframes/
    ArenaOwners.PNG screen 2), in one round trip."""

    total_revenue: Decimal
    revenue_change_pct: float | None
    total_bookings: int
    bookings_change_pct: float | None
    peak_hours: PeakHours | None
    occupancy_rate: float | None
    occupancy_change_pts: float | None
    revenue_trend: list[RevenueTrendPoint]
    bookings_by_time: list[BookingsByHourPoint]
    top_arenas: list[TopArenaItem]
    recent_bookings: list[RecentBookingItem]


class OwnerBookingRow(BaseModel):
    """One row of the booking-management table (wireframe screen 5)."""

    booking_id: uuid.UUID
    # the reference the player sees and writes on a bank transfer (AHB-xxxxxx)
    booking_code: str = ""
    booking_date: date
    start_time: time
    end_time: time
    arena_id: uuid.UUID
    arena_name: str
    court_id: uuid.UUID
    court_name: str
    player_name: str
    total_amount: Decimal
    status: BookingStatus
    # the player's phone, masked (+92 300 11••••): the full number never leaves the server
    player_phone: str | None = None
    payment_id: uuid.UUID | None = None
    payment_method: PaymentMethod | None = None
    payment_status: PaymentStatus | None = None
    payment_lifecycle_status: PaymentLifecycleStatus | None = None
    receipt_proof_url: ReceiptLink = None
    # the payment above is a balance receipt waiting for the owner (the booking is confirmed)
    balance_receipt: bool = False
    # "Awaiting payment" and the slot still ahead: the owner may send a reminder
    can_remind: bool = False
    # minutes until another reminder may be sent, while one went out in the last hour
    remind_wait_minutes: int | None = None
