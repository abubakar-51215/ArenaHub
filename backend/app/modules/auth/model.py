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
    # HMAC-SHA256 of the code (keyed with CODE_HASH_SECRET, bound to the purpose, the user and
    # the address it went to); the code itself is never stored. See app/shared/codes.py.
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)  # email | sms
    # OtpPurpose value. Lookups always filter on it (see app.shared.otp.OtpPurpose).
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # set when the code is accepted, or ended by a newer code: a code works once
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # the email could not be sent: this code does not count toward the wait or the hourly maximum
    delivery_failed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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


class RefreshToken(UUIDPrimaryKeyMixin, Base):
    """One refresh token of one sign-in. Only the SHA-256 hash is kept (the token itself is a
    random string the app holds), and the tokens of one sign-in share a ``family_id``. A token works
    once: using it again (``used_at`` set) means it was copied, so the whole family is revoked. See
    app/modules/auth/sessions.py."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
