"""Auth support tables: OTP verifications and password-reset tokens.

These aren't in doc 09 (which stops at the auth-adjacent `users` columns);
they're standard infra tables backing the OTP-registration and password-reset
flows required by docs 03/06. Expiry *durations* are service-layer constants
(set when a row is created), not schema — so no business rules are baked in
here. The tables just record the issued code/token and its expiry.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base
from app.database.mixins import UUIDPrimaryKeyMixin


class OtpVerification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "otp_verifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # email | sms
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class PasswordResetToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "password_reset_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Store a hash of the reset token, never the raw value.
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)


class PasswordHistory(UUIDPrimaryKeyMixin, Base):
    """Recent password hashes per user, so a change/reset can reject reuse of
    the last N passwords (MASTER_DEVELOPMENT_PLAN.md — "last-3 reuse")."""

    __tablename__ = "password_history"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
