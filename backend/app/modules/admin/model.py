"""AuditLog — who did what, when, from where, and whether it worked: admin actions (for the
audit-log browser), sign-ins and failures, password and email changes, code requests, refunds.
One row per action; ``details`` is free-form but never holds a password, code or token (see
app/shared/audit.py).
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

    # empty for something done by nobody signed in (a failed sign-in, a code asked for by address)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # who and how: the client address and request id of the call, and whether it worked
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    result: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ok", server_default="ok"
    )

    actor: Mapped["User | None"] = relationship()


class PlatformSettings(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Singleton row of site-wide settings (General tab, Admin.PNG screen 10).

    A single free-form JSONB blob rather than one column per field — the
    wireframe's other tabs (email/SMS/payment gateways/etc.) aren't backed by
    endpoints yet, and a JSONB blob lets those land later without a migration.
    """

    __tablename__ = "platform_settings"

    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
