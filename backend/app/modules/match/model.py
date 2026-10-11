"""Match + MatchParticipant — the "Play" matchmaking feature.

A deliberately lightweight social listing: a match is played on one of the
creator's own confirmed, upcoming bookings (``booking_group_id``), and a
booking has at most one open match. Players join for free; **no payment
happens in the app** (they settle the court price between themselves).
"""

import uuid
from datetime import date, datetime, time
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena
    from app.modules.court.model import Court
    from app.modules.user.model import User


class MatchStatus(StrEnum):
    open = "open"
    full = "full"
    cancelled = "cancelled"
    completed = "completed"


class Match(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "matches"
    __table_args__ = (
        CheckConstraint("max_players > 0", name="ck_matches_max_players_positive"),
        # one open (or full) match per booking
        Index(
            "uq_matches_one_live_match_per_booking",
            "booking_group_id",
            unique=True,
            postgresql_where=text("booking_group_id IS NOT NULL AND status IN ('open', 'full')"),
        ),
    )

    creator_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arenas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    court_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courts.id", ondelete="CASCADE"), nullable=False
    )
    # the creator's confirmed booking this match is played on (NULL only for matches made before G6)
    booking_group_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    sport: Mapped[str] = mapped_column(String(50), nullable=False)
    match_date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    max_players: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="match_status"), nullable=False, default=MatchStatus.open, index=True
    )

    creator: Mapped["User"] = relationship()
    arena: Mapped["Arena"] = relationship()
    court: Mapped["Court"] = relationship()
    participants: Mapped[list["MatchParticipant"]] = relationship(
        back_populates="match", cascade="all, delete-orphan"
    )


class MatchParticipant(UUIDPrimaryKeyMixin, Base):
    """A player who joined a match. The creator is auto-inserted as the
    first participant on match creation, so "players joined" is always
    ``len(participants)`` with no separate counter to keep in sync."""

    __tablename__ = "match_participants"
    __table_args__ = (
        UniqueConstraint("match_id", "player_id", name="uq_match_participants_match_id_player_id"),
    )

    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    match: Mapped["Match"] = relationship(back_populates="participants")
    player: Mapped["User"] = relationship()
