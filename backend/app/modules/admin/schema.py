"""Pydantic models for the admin panel: verification (existing), user
management, platform-wide booking/payment monitoring, dashboard metrics, and
the audit log.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.booking.model import BookingStatus, PaymentPlan
from app.modules.payment.model import PaymentMethod
from app.modules.payment.model import PaymentStatus as PayStatus
from app.modules.user.model import UserRole


class RejectArenaRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


# ---- user management --------------------------------------------------


class SuspendUserRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class AdminUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    phone: str
    role: UserRole
    is_verified: bool
    is_active: bool
    created_at: datetime


class AdminUserDetailResponse(AdminUserResponse):
    total_bookings: int


# ---- booking / payment monitoring --------------------------------------------------


class AdminBookingResponse(BaseModel):
    id: uuid.UUID
    player_id: uuid.UUID
    player_name: str
    arena_id: uuid.UUID
    arena_name: str
    court_name: str
    booking_date: date
    start_time: time
    end_time: time
    total_amount: Decimal
    payment_type: PaymentPlan
    status: BookingStatus
    created_at: datetime


class AdminPaymentResponse(BaseModel):
    id: uuid.UUID
    player_id: uuid.UUID
    player_name: str
    arena_name: str | None
    amount: Decimal
    currency: str
    payment_method: PaymentMethod
    gateway_transaction_id: str | None
    status: PayStatus
    created_at: datetime


# ---- dashboard --------------------------------------------------


class DashboardMetrics(BaseModel):
    total_players: int
    total_owners: int
    total_arenas: int
    pending_arenas: int
    approved_arenas: int
    rejected_arenas: int
    bookings_today: int
    bookings_this_month: int
    bookings_all_time: int
    total_revenue: float
    active_complaints: int


# ---- platform settings --------------------------------------------------


class PlatformSettingsRequest(BaseModel):
    site_name: str = Field(min_length=1, max_length=255)
    site_description: str = Field(default="", max_length=1000)
    site_email: str = Field(max_length=255)
    site_phone: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=500)
    default_currency: str = Field(default="PKR", max_length=10)
    timezone: str = Field(default="Asia/Karachi", max_length=50)


class PlatformSettingsResponse(PlatformSettingsRequest):
    pass


# ---- audit log --------------------------------------------------


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    actor_name: str
    action: str
    target_type: str
    target_id: str
    details: dict
    created_at: datetime
