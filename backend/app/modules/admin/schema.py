"""Pydantic models for the admin panel: verification (existing), user
management, platform-wide booking/payment monitoring, dashboard metrics, and
the audit log.
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.booking.model import BookingStatus, PaymentPlan
from app.modules.payment.model import PaymentMethod
from app.modules.payment.model import PaymentStatus as PayStatus
from app.modules.user.model import UserRole


class RejectArenaRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


class ArenaModerationRequest(BaseModel):
    """Suspend, reactivate or remove an arena. The reason is mandatory: it goes
    to the owner (suspend / remove) and into the audit log."""

    reason: str = Field(min_length=10, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def _trim(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


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
    # a refund for this booking is still waiting (gateway retry, or manual)
    refund_pending: bool = False


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
    # a refund against this payment is still waiting (gateway retry, or manual)
    refund_pending: bool = False


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


class OverviewPeriod(BaseModel):
    start: date
    end: date
    previous_start: date
    previous_end: date
    range: str


class OverviewKpi(BaseModel):
    """``value`` is the headline figure; ``delta_pct`` compares the current
    period with the previous one (None when there is nothing to compare);
    ``series`` is one point per day of the current period; ``extra`` is the
    card's second figure (new sign-ups, bookings today, arenas pending)."""

    value: float
    delta_pct: float | None
    series: list[float]
    extra: int | None


class OverviewKpis(BaseModel):
    players: OverviewKpi
    bookings: OverviewKpi
    gross_value: OverviewKpi
    live_arenas: OverviewKpi


class DayPoint(BaseModel):
    date: date
    value: int


class CityShare(BaseModel):
    city: str
    bookings: int
    share_pct: float


class HourPoint(BaseModel):
    hour: int
    used: int
    total: int
    pct: float


class PeakWindow(BaseModel):
    start_hour: int
    end_hour: int


class TopArena(BaseModel):
    arena_id: uuid.UUID
    name: str
    city: str
    bookings: int
    value: float


class QueueSummary(BaseModel):
    pending_arenas: int
    open_complaints: int
    oldest_waiting_at: datetime | None


class DashboardOverview(BaseModel):
    period: OverviewPeriod
    city: str | None
    kpis: OverviewKpis
    bookings_by_day: list[DayPoint]
    previous_bookings_by_day: list[DayPoint]
    by_city: list[CityShare]
    utilisation_by_hour: list[HourPoint]
    peak_window: PeakWindow | None
    top_arenas: list[TopArena]
    queue: QueueSummary


# ---- platform settings --------------------------------------------------


class EmailSettings(BaseModel):
    """Channel-level toggle + display name only — SMTP credentials stay in
    server-side env vars (app/core/config.py), never in this admin-editable
    row (docs/PROJECT_GUIDELINES.md: secrets never travel through the DB)."""

    enabled: bool = True
    from_name: str = Field(default="ArenaHub", max_length=100)


class SmsSettings(BaseModel):
    """No SMS gateway is wired yet (deviation #7: OTP delivery is email-only
    today) — this only records the platform's intent so the toggle isn't
    lost when a provider lands."""

    enabled: bool = False
    provider: str = Field(default="", max_length=50)


class PaymentGatewaySettings(BaseModel):
    card_enabled: bool = True
    jazzcash_enabled: bool = True
    easypaisa_enabled: bool = True
    bank_transfer_enabled: bool = True


class BookingPolicySettings(BaseModel):
    default_advance_percentage: int = Field(default=50, ge=0, le=100)
    min_advance_hours: int = Field(default=1, ge=0)
    max_advance_days: int = Field(default=30, ge=1)
    auto_cancel_hours: int = Field(default=24, ge=1)


class NotificationSettings(BaseModel):
    booking_enabled: bool = True
    payment_enabled: bool = True
    reminder_enabled: bool = True


class PlatformSettingsRequest(BaseModel):
    site_name: str = Field(min_length=1, max_length=255)
    site_description: str = Field(default="", max_length=1000)
    site_email: str = Field(max_length=255)
    site_phone: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=500)
    default_currency: str = Field(default="PKR", max_length=10)
    timezone: str = Field(default="Asia/Karachi", max_length=50)
    email: EmailSettings = Field(default_factory=EmailSettings)
    sms: SmsSettings = Field(default_factory=SmsSettings)
    payment_gateways: PaymentGatewaySettings = Field(default_factory=PaymentGatewaySettings)
    booking_policy: BookingPolicySettings = Field(default_factory=BookingPolicySettings)
    notifications: NotificationSettings = Field(default_factory=NotificationSettings)


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
