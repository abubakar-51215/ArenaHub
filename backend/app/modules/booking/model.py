"""Booking — one row per booked time slot (docs/09_DATABASE_DESIGN.md).

A "multi-slot" checkout (player books several slots in one flow) creates one
``Booking`` row per slot, all sharing ``booking_group_id`` — the schema stays
exactly one row per ``time_slots`` row (matches doc 09's direct ``slot_id``
FK and keeps per-slot locking/availability simple), while the group id lets
the API and payment module treat the checkout as one unit.

``payment_status`` is a cached read-model of the authoritative status on the
``payments`` row (deviation #11); the payment module (next) writes both in
the same transaction. ``PaymentStatus`` lives here, not on payment, because
booking needs it first — payment imports it rather than redefining it.
"""

import uuid
from datetime import date, time
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Index, Integer, Numeric, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena
    from app.modules.court.model import Court
    from app.modules.slot.model import TimeSlot
    from app.modules.user.model import User


class BookingStatus(StrEnum):
    pending_payment = "pending_payment"
    pending_approval = "pending_approval"
    confirmed = "confirmed"
    completed = "completed"
    cancelled = "cancelled"
    rejected = "rejected"


class PaymentPlan(StrEnum):
    full = "full"
    advance = "advance"


class PaymentStatus(StrEnum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    refunded = "refunded"


class Booking(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        Index("ix_bookings_player_id_status", "player_id", "status"),
        Index("ix_bookings_arena_id_status", "arena_id", "status"),
        Index("ix_bookings_booking_group_id", "booking_group_id"),
    )

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arenas.id", ondelete="CASCADE"), nullable=False
    )
    court_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courts.id", ondelete="CASCADE"), nullable=False
    )
    slot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("time_slots.id", ondelete="RESTRICT"), nullable=False
    )
    # Groups the rows created by one multi-slot checkout; null-safe (a single
    # -slot booking still gets a group id of its own for symmetry).
    booking_group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)

    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    advance_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )
    remaining_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0")
    )
    payment_type: Mapped[PaymentPlan] = mapped_column(
        Enum(PaymentPlan, name="booking_payment_plan"), nullable=False
    )

    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status"),
        nullable=False,
        default=BookingStatus.pending_payment,
        index=True,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="booking_payment_status"),
        nullable=False,
        default=PaymentStatus.pending,
    )

    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Not in doc 09 — added so the payment module can compute the exact
    # refund amount later without re-deriving hours-before-start at a
    # different point in time (the tier resolved at cancellation must stick).
    refund_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    player: Mapped["User"] = relationship()
    arena: Mapped["Arena"] = relationship()
    court: Mapped["Court"] = relationship()
    slot: Mapped["TimeSlot"] = relationship()
