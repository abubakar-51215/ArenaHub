"""Equipment — rentable items an arena offers as a booking addon
(docs/09_DATABASE_DESIGN.md), plus the join row recording what a booking
actually rented.

``quantity_available`` is decremented when a booking reserves equipment and
restored on cancellation (docs/11 section 8) — the booking module owns that
transition; this module only owns the CRUD and the running count.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena


class Equipment(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "equipment"

    arena_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("arenas.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    rental_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity_total: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_available: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    arena: Mapped["Arena"] = relationship()


class BookingEquipment(UUIDPrimaryKeyMixin, Base):
    """One rented-equipment line on a booking. ``booking_id`` FK is RESTRICT
    (not CASCADE) so an equipment row's rental history survives even if the
    booking module changes how it deletes bookings — bookings are cancelled,
    never hard-deleted, but this keeps the invariant explicit."""

    __tablename__ = "booking_equipment"

    booking_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    equipment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("equipment.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    equipment: Mapped["Equipment"] = relationship()
