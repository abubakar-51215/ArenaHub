"""Court model — a bookable playing surface belonging to an arena — plus its
time-window peak-pricing rules (Sprint 2, Track B)."""

import uuid
from datetime import datetime, time
from decimal import Decimal
from enum import IntEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena


class Weekday(IntEnum):
    """ISO weekday numbering (Mon=1 … Sun=7) to match ``date.isoweekday()``."""

    monday = 1
    tuesday = 2
    wednesday = 3
    thursday = 4
    friday = 5
    saturday = 6
    sunday = 7


class Court(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "courts"
    __table_args__ = (CheckConstraint("base_price > 0", name="ck_courts_base_price_positive"),)

    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("arenas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sport_types: Mapped[list] = mapped_column(JSONB, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    arena: Mapped["Arena"] = relationship(back_populates="courts")
    pricing_rules: Mapped[list["CourtPricingRule"]] = relationship(
        back_populates="court",
        cascade="all, delete-orphan",
    )


class CourtPricingRule(UUIDPrimaryKeyMixin, Base):
    """A peak-pricing window: on ``weekday`` (null = every day), bookings that
    start within [start_time, end_time) cost ``base_price * multiplier``. The
    booking engine (Sprint 3) resolves the effective price from these rules."""

    __tablename__ = "court_pricing_rules"
    __table_args__ = (
        CheckConstraint("price_multiplier > 0", name="ck_court_pricing_rules_multiplier_positive"),
        CheckConstraint("end_time > start_time", name="ck_court_pricing_rules_time_order"),
    )

    court_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # ISO weekday (1-7); null applies the rule on every day.
    weekday: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    price_multiplier: Mapped[Decimal] = mapped_column(
        Numeric(4, 2), nullable=False, default=Decimal("1.00")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    court: Mapped["Court"] = relationship(back_populates="pricing_rules")
