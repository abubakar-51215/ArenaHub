"""TimeSlot — a single bookable hour on a court (docs/09_DATABASE_DESIGN.md).

Slots are generated from the parent arena's ``operating_hours`` (one row per
hour of the day the arena is open) rather than created ad hoc; the booking
engine (Sprint 3) locks and books individual slot rows.
"""

import uuid
from datetime import date, time
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Index, Numeric, Time, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.court.model import Court


class SlotStatus(StrEnum):
    available = "available"
    # Transiently held by an in-flight booking attempt (Redis lock acquired);
    # not written by the slot module itself — the booking module (next) owns
    # this transition.
    reserved = "reserved"
    booked = "booked"
    maintenance = "maintenance"


class TimeSlot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "time_slots"
    __table_args__ = (
        UniqueConstraint("court_id", "date", "start_time", name="uq_time_slots_court_date_start"),
        Index("ix_time_slots_court_id_date", "court_id", "date"),
    )

    court_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    status: Mapped[SlotStatus] = mapped_column(
        Enum(SlotStatus, name="slot_status"),
        nullable=False,
        default=SlotStatus.available,
        index=True,
    )
    # Snapshot of the resolved price (base * peak multiplier) at generation
    # time, so later base_price/pricing-rule edits don't retroactively change
    # a slot a player is already looking at.
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    court: Mapped["Court"] = relationship()
