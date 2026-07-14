"""Pydantic response models for the owner dashboard.

Purely a read-side composition module — no table of its own, so every field
here is derived from bookings/payments/arenas at request time.
"""

import uuid
from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.booking.model import BookingStatus


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
    receipt_proof_url: str | None = None


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
