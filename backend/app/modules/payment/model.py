"""Payment + Refund (docs/09_DATABASE_DESIGN.md, deviation #2 payment
methods).

One ``Payment`` row covers a whole booking checkout group (``booking_group_id``
on ``bookings`` — see modules/booking/model.py's docstring for why one
checkout can span several booking rows): a real gateway transaction is one
charge, even when it pays for several slots at once. ``Refund`` stays
singular per ``booking_id`` (matches docs/09 exactly) since a player can
cancel one slot out of a multi-slot booking independently, and refunds are
drawn against that one row's own amount.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.booking.model import PaymentPlan, PaymentStatus

if TYPE_CHECKING:
    from app.modules.booking.model import Booking
    from app.modules.user.model import User


class PaymentMethod(StrEnum):
    card = "card"
    jazzcash = "jazzcash"
    easypaisa = "easypaisa"
    bank_transfer = "bank_transfer"


class PaymentPurpose(StrEnum):
    """What a payment row is for. ``booking`` is the initial charge that
    confirms the group; ``balance`` settles a later outstanding balance
    (e.g. the difference after rescheduling to a pricier slot) without
    re-confirming the already-confirmed bookings."""

    booking = "booking"
    balance = "balance"


class PaymentLifecycleStatus(StrEnum):
    """Fine-grained payment lifecycle, tracked alongside the coarse
    ``PaymentStatus`` (pending/completed/failed/refunded) that drives booking
    state and revenue queries. This richer view is for observability and
    gateway-integration debugging — every transition is recorded as a
    ``PaymentEvent``. Allowed transitions are enforced in
    ``payment/state_machine.py``."""

    pending = "pending"
    initiated = "initiated"  # charge started with the gateway
    processing = "processing"  # gateway reports in-flight (reserved for real PSPs)
    pending_approval = "pending_approval"  # bank_transfer receipt awaiting owner
    paid = "paid"  # money captured / owner-approved
    confirmed = "confirmed"  # booking group confirmed after payment
    failed = "failed"
    expired = "expired"  # payment window elapsed before capture
    rejected = "rejected"  # bank_transfer receipt rejected by owner
    refunded = "refunded"  # fully refunded


class RefundStatus(StrEnum):
    pending = "pending"
    processed = "processed"
    failed = "failed"


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_booking_group_id", "booking_group_id"),
        CheckConstraint("amount > 0", name="ck_payments_amount_positive"),
    )

    booking_group_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="PKR")
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method"), nullable=False
    )
    # stripe | jazzcash | easypaisa | manual — kept separate from
    # payment_method so a future PSP swap behind the "card" method doesn't
    # need a schema change (deviation #2).
    payment_provider: Mapped[str] = mapped_column(String(20), nullable=False)
    gateway_transaction_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), nullable=False, default=PaymentStatus.pending
    )
    # Fine-grained lifecycle for observability, tracked alongside the coarse
    # `status` above (which stays the source of truth for booking/revenue).
    lifecycle_status: Mapped[PaymentLifecycleStatus] = mapped_column(
        Enum(PaymentLifecycleStatus, name="payment_lifecycle_status"),
        nullable=False,
        default=PaymentLifecycleStatus.pending,
    )
    payment_type: Mapped[PaymentPlan] = mapped_column(
        Enum(PaymentPlan, name="payment_plan"), nullable=False
    )
    purpose: Mapped[PaymentPurpose] = mapped_column(
        Enum(PaymentPurpose, name="payment_purpose"),
        nullable=False,
        default=PaymentPurpose.booking,
    )
    receipt_proof_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    player: Mapped["User"] = relationship()
    refunds: Mapped[list["Refund"]] = relationship(back_populates="payment")
    events: Mapped[list["PaymentEvent"]] = relationship(
        back_populates="payment",
        cascade="all, delete-orphan",
        order_by="PaymentEvent.created_at",
    )


class Refund(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "refunds"
    __table_args__ = (CheckConstraint("amount >= 0", name="ck_refunds_amount_nonneg"),)

    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[RefundStatus] = mapped_column(
        Enum(RefundStatus, name="refund_status"), nullable=False, default=RefundStatus.pending
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    booking: Mapped["Booking"] = relationship()
    payment: Mapped["Payment"] = relationship(back_populates="refunds")


class PaymentEvent(UUIDPrimaryKeyMixin, Base):
    """Append-only audit trail of a payment's lifecycle transitions — one row
    per state change (created, initiated, receipt uploaded, paid, confirmed,
    refunded, …). Never mutated, so it survives as a dispute-resolution and
    debugging record even as the payment's own status moves on."""

    __tablename__ = "payment_events"

    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("payments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Null on the very first (creation) event; otherwise the status the
    # payment moved out of.
    from_status: Mapped[PaymentLifecycleStatus | None] = mapped_column(
        Enum(PaymentLifecycleStatus, name="payment_lifecycle_status"), nullable=True
    )
    to_status: Mapped[PaymentLifecycleStatus] = mapped_column(
        Enum(PaymentLifecycleStatus, name="payment_lifecycle_status"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), server_default=func.now(), nullable=False
    )

    payment: Mapped["Payment"] = relationship(back_populates="events")
