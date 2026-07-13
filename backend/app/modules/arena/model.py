"""Arena, Amenity, the arena_amenities association, and the arena-scoped
pricing/verification satellites (blocked dates, discount codes).

Owner approval status lives here (pending → approved/rejected) and is set by
the admin verification workflow in Sprint 2.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.court.model import Court
    from app.modules.user.model import User


class DiscountType(StrEnum):
    percentage = "percentage"
    fixed = "fixed"


class ArenaStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ArenaCity(StrEnum):
    """Cities ArenaHub currently operates in (single country: Pakistan, PKR)."""

    lahore = "Lahore"
    islamabad = "Islamabad"
    karachi = "Karachi"
    multan = "Multan"


# Many-to-many association between arenas and amenities.
arena_amenities = Table(
    "arena_amenities",
    Base.metadata,
    Column(
        "arena_id",
        UUID(as_uuid=True),
        ForeignKey("arenas.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "amenity_id",
        UUID(as_uuid=True),
        ForeignKey("amenities.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Arena(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "arenas"
    __table_args__ = (Index("ix_arenas_lat_lng", "latitude", "longitude"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[ArenaCity] = mapped_column(
        Enum(ArenaCity, name="arena_city", values_callable=lambda enum: [e.value for e in enum]),
        nullable=False,
        index=True,
    )
    area: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(10, 7), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    operating_hours: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sports_offered: Mapped[list] = mapped_column(JSONB, nullable=False)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[ArenaStatus] = mapped_column(
        Enum(ArenaStatus, name="arena_status"),
        nullable=False,
        default=ArenaStatus.pending,
        index=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    advance_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    require_full_payment: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Cancellation refund tiers: ordered list of {hours_before, refund_percentage}.
    # Free-form JSONB so the booking module (Sprint 3) can evolve tiers without a
    # migration; the arena service validates the shape on write.
    refund_policy: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    owner: Mapped["User"] = relationship(back_populates="arenas")
    courts: Mapped[list["Court"]] = relationship(
        back_populates="arena",
        cascade="all, delete-orphan",
    )
    amenities: Mapped[list["Amenity"]] = relationship(
        secondary=arena_amenities,
        back_populates="arenas",
    )
    blocked_dates: Mapped[list["ArenaBlockedDate"]] = relationship(
        back_populates="arena",
        cascade="all, delete-orphan",
    )
    discount_codes: Mapped[list["DiscountCode"]] = relationship(
        back_populates="arena",
        cascade="all, delete-orphan",
    )


class Amenity(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "amenities"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    arenas: Mapped[list["Arena"]] = relationship(
        secondary=arena_amenities,
        back_populates="amenities",
    )


class ArenaBlockedDate(UUIDPrimaryKeyMixin, Base):
    """A single calendar day on which an arena takes no bookings (maintenance,
    private event). Unique per (arena, date) so a day can't be double-blocked."""

    __tablename__ = "arena_blocked_dates"
    __table_args__ = (
        UniqueConstraint("arena_id", "blocked_date", name="uq_arena_blocked_dates_arena_id_date"),
    )

    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("arenas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    blocked_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    arena: Mapped["Arena"] = relationship(back_populates="blocked_dates")


class DiscountCode(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An owner-defined promo code scoped to one arena. Percentage or fixed
    amount, optional usage cap + validity window + minimum-spend threshold."""

    __tablename__ = "discount_codes"
    __table_args__ = (UniqueConstraint("arena_id", "code", name="uq_discount_codes_arena_id_code"),)

    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("arenas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    discount_type: Mapped[DiscountType] = mapped_column(
        Enum(DiscountType, name="discount_type"), nullable=False
    )
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_booking_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )
    max_uses: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    arena: Mapped["Arena"] = relationship(back_populates="discount_codes")
