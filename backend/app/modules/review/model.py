"""Review — a player's rating + optional text on a completed booking
(docs/09_DATABASE_DESIGN.md, docs/06_PLAYER_MODULE.md section 14).

``rating`` is a plain ``Integer`` with a ``CHECK`` constraint rather than a
SQLAlchemy ``Enum`` — matches doc 09's literal ``CHECK (1-5)`` and sidesteps
the Postgres ENUM-type downgrade trap hit repeatedly elsewhere in this
project (dev log). ``owner_response``/flagging fields are additive beyond
doc 09, per MASTER_DEVELOPMENT_PLAN.md's Track B review-module scope (edit
window, owner response, report/flag, rating recompute); rating recompute is
done live via an aggregate query rather than a cached column on ``arenas``
(no rating column exists there — see ``repository.get_rating_summary``).
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena
    from app.modules.booking.model import Booking
    from app.modules.user.model import User


class Review(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),)

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arenas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # RESTRICT + unique: one review per booking (doc 06 section 14), and a
    # booking's review history survives however bookings end up being pruned.
    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Naive, like Refund.processed_at — this module compares against naive
    # datetime.now() throughout, matching the booking/payment convention.
    owner_response_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    is_flagged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    flagged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    flagged_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    player: Mapped["User"] = relationship(foreign_keys=[player_id])
    arena: Mapped["Arena"] = relationship()
    booking: Mapped["Booking"] = relationship()
