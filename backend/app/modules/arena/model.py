"""Arena, Amenity, and the arena_amenities association.

Owner approval status lives here (pending → approved/rejected) and is set by
the admin verification workflow in Sprint 2.
"""

import uuid
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.court.model import Court
    from app.modules.user.model import User


class ArenaStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


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
    city: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
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


class Amenity(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "amenities"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    arenas: Mapped[list["Arena"]] = relationship(
        secondary=arena_amenities,
        back_populates="amenities",
    )
