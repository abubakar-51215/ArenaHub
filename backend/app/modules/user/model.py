"""User model and role enum.

Staff sub-tiers are deliberately NOT in the role enum (docs/PROJECT_GUIDELINES.md
deviation #10); the model is shaped so a future arena_staff table can be added
without reworking ownership.
"""

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.database.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.modules.arena.model import Arena


class UserRole(StrEnum):
    player = "player"
    owner = "owner"
    admin = "admin"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)

    profile_picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_sports: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    preferred_locations: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Per-user notification channel toggles (email/sms/push); free-form so the
    # notification module (Sprint 5) can add event types without a migration.
    notification_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Set while a phone-change OTP is outstanding; promoted to `phone` on verify.
    pending_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # tz-aware: compared against aware UTC "now" in the lockout check.
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Soft-delete grace: set on account deletion; a scheduled job purges later.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Arenas owned by this user (only meaningful for role=owner).
    arenas: Mapped[list["Arena"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )
