"""AuditLog — records admin actions for the audit-log browser (master plan
Sprint 5). One row per admin action; ``details`` is free-form so new action
types never need a migration.
"""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.user.model import User


class AuditLog(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    actor: Mapped["User"] = relationship()


class PlatformSettings(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Singleton row of site-wide settings (General tab, Admin.PNG screen 10).

    A single free-form JSONB blob rather than one column per field — the
    wireframe's other tabs (email/SMS/payment gateways/etc.) aren't backed by
    endpoints yet, and a JSONB blob lets those land later without a migration.
    """

    __tablename__ = "platform_settings"

    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
