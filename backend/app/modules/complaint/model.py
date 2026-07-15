"""Complaint — player-submitted support tickets (docs/08_ADMIN_MODULE.md §8,
docs/09_DATABASE_DESIGN.md ``complaints``).

A deliberately simple ticket: category + free-text description, an admin
response, and a three-state status. No assignment/priority fields — the
wireframe shows a priority column but doc 09's schema doesn't define one, and
inventing a field the API spec doesn't cover would outrun the frozen contract.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.user.model import User


class ComplaintCategory(StrEnum):
    booking_issue = "booking_issue"
    payment_issue = "payment_issue"
    arena_quality = "arena_quality"
    owner_behavior = "owner_behavior"
    technical_problem = "technical_problem"
    other = "other"


class ComplaintStatus(StrEnum):
    open = "open"
    under_review = "under_review"
    resolved = "resolved"


class Complaint(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "complaints"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[ComplaintCategory] = mapped_column(
        Enum(ComplaintCategory, name="complaint_category"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ComplaintStatus] = mapped_column(
        Enum(ComplaintStatus, name="complaint_status"),
        nullable=False,
        default=ComplaintStatus.open,
        index=True,
    )
    admin_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    player: Mapped["User"] = relationship()
