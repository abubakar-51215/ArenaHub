"""Auth business logic: registration, OTP verification, login with lockout,
refresh rotation + replay detection, logout, and password reset.

All rules live here (services own logic + transactions); the repository only
runs queries, ``tokens`` holds the Redis session state, and ``security`` mints
the JWTs. Lockout, token lifetimes, and password policy follow FR-P-01/02.
"""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError, ValidationError
from app.core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.modules.auth import repository as repo
from app.modules.auth import tokens
from app.modules.auth.schema import (
    ForgotPasswordRequest,
    LoginRequest,
    OtpVerifyRequest,
    RegisterRequest,
    RegisterResponse,
    ResetPasswordRequest,
    TokenResponse,
)
from app.modules.user.model import User, UserRole
from app.modules.user.schema import UserPublic
from app.shared.otp import (
    MAX_OTP_ATTEMPTS,
    OTP_TTL,
    RESET_TOKEN_TTL,
    deliver_otp,
    deliver_reset_link,
    generate_otp_code,
    generate_reset_token,
)

LOGIN_MAX_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
PASSWORD_HISTORY_DEPTH = 3

_INVALID_CREDENTIALS = "Invalid email or password."
_ACCOUNT_LOCKED = "Your account has been locked. Please try again after 15 minutes."


def _now() -> datetime:
    return datetime.now(UTC)


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    shown = local[0] if local else ""
    return f"{shown}***@{domain}"


def _issue_tokens(user: User) -> TokenResponse:
    """Mint a fresh access + refresh pair (new refresh-token family)."""
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


async def _send_registration_otp(db: AsyncSession, user: User) -> None:
    code = generate_otp_code()
    await repo.create_otp(
        db, user_id=user.id, code=code, channel="email", expires_at=_now() + OTP_TTL
    )
    deliver_otp(user.email, code, purpose="registration")


async def register(db: AsyncSession, data: RegisterRequest) -> RegisterResponse:
    validate_password_strength(data.password)
    if await repo.get_user_by_email(db, data.email):
        raise ConflictError("Email is already registered.")
    if await repo.get_user_by_phone(db, data.phone):
        raise ConflictError("Phone number is already registered.")

    password_hash = hash_password(data.password)
    user = await repo.create_user(
        db,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        password_hash=password_hash,
        role=UserRole(data.role),
    )
    await repo.add_password_history(db, user.id, password_hash)
    await _send_registration_otp(db, user)
    await db.commit()
    return RegisterResponse(
        user=UserPublic.model_validate(user), otp_sent_to=_mask_email(user.email)
    )


async def verify_otp(db: AsyncSession, data: OtpVerifyRequest) -> TokenResponse:
    user = await repo.get_user_by_email(db, data.email)
    if user is None:
        raise ValidationError("Invalid or expired verification code.")
    if user.is_verified:
        raise ConflictError("Account is already verified.")

    otp = await repo.get_latest_otp(db, user.id)
    if otp is None or otp.expires_at < _now():
        raise ValidationError("Invalid or expired verification code.")
    if otp.attempts >= MAX_OTP_ATTEMPTS:
        raise ValidationError("Too many incorrect attempts. Request a new code.")
    if otp.code != data.code:
        otp.attempts += 1
        await db.commit()
        raise ValidationError("Invalid or expired verification code.")

    otp.is_used = True
    user.is_verified = True
    await db.commit()
    return _issue_tokens(user)


OTP_RESEND_COOLDOWN = timedelta(seconds=60)


async def resend_otp(db: AsyncSession, email: str) -> str | None:
    """Re-issue the registration OTP (expired code, lost email). Returns the
    masked destination, or None when there is nothing to send — the endpoint
    answers identically either way so this can't be used to probe which
    emails are registered. A 60s cooldown (measured off the latest OTP's
    creation time) stops a hammered resend button from queueing a pile of
    codes; the auth rate limiter still applies on top."""
    user = await repo.get_user_by_email(db, email)
    if user is None or user.is_verified:
        return None

    latest = await repo.get_latest_otp(db, user.id)
    if latest is not None:
        issued_at = latest.expires_at - OTP_TTL  # same tz handling as expires_at
        if _now() - issued_at < OTP_RESEND_COOLDOWN:
            raise ValidationError("Please wait a minute before requesting another code.")
        # Retire the outstanding code so exactly one code is valid at a time.
        latest.is_used = True

    await _send_registration_otp(db, user)
    await db.commit()
    return _mask_email(user.email)


async def _register_failed_login(db: AsyncSession, user: User) -> None:
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= LOGIN_MAX_ATTEMPTS:
        user.locked_until = _now() + LOCKOUT_DURATION
        user.failed_login_attempts = 0
    await db.commit()


async def login(db: AsyncSession, data: LoginRequest) -> TokenResponse:
    user = await repo.get_user_by_email(db, data.email)
    if user is None or user.deleted_at is not None or not user.is_active:
        raise UnauthorizedError(_INVALID_CREDENTIALS)
    if user.locked_until is not None and user.locked_until > _now():
        raise UnauthorizedError(_ACCOUNT_LOCKED)

    if not verify_password(data.password, user.password_hash):
        await _register_failed_login(db, user)
        raise UnauthorizedError(_INVALID_CREDENTIALS)
    if not user.is_verified:
        raise UnauthorizedError("Please verify your account before logging in.")

    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()
    return _issue_tokens(user)


async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token, TokenType.refresh)
    family, jti, user_id = payload["family"], payload["jti"], payload["sub"]

    if await tokens.is_family_revoked(family):
        raise UnauthorizedError("Session revoked, please log in again.")
    if await tokens.is_refresh_used(jti):
        # Replay of a rotated token — kill the whole family (deviation #17).
        await tokens.revoke_family(family)
        raise UnauthorizedError("Refresh token reuse detected; session revoked.")
    if int(payload.get("iat", 0)) < await tokens.get_session_epoch(user_id):
        raise UnauthorizedError("Session expired, please log in again.")

    user = await repo.get_user_by_id(db, uuid.UUID(user_id))
    if user is None or user.deleted_at is not None or not user.is_active:
        raise UnauthorizedError("Account is not active.")

    await tokens.mark_refresh_used(jti)
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, family=family),
    )


async def logout(access_token: str, refresh_token: str) -> None:
    """Invalidate the current session: denylist this access token and revoke
    the refresh-token family so neither can be used again."""
    access_payload = decode_token(access_token, TokenType.access)
    await tokens.deny_access(access_payload["jti"])
    try:
        refresh_payload = decode_token(refresh_token, TokenType.refresh)
    except UnauthorizedError:
        return  # Best-effort: a bad refresh token doesn't block logout.
    await tokens.revoke_family(refresh_payload["family"])


async def forgot_password(db: AsyncSession, data: ForgotPasswordRequest) -> None:
    """Always succeeds from the caller's view — never reveals if an email
    exists (anti-enumeration)."""
    user = await repo.get_user_by_email(db, data.email)
    if user is None or user.deleted_at is not None:
        return

    raw_token = generate_reset_token()
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    await repo.create_reset_token(
        db, user_id=user.id, token_hash=token_hash, expires_at=_now() + RESET_TOKEN_TTL
    )
    await db.commit()
    deliver_reset_link(user.email, raw_token)


async def reset_password(db: AsyncSession, data: ResetPasswordRequest) -> None:
    validate_password_strength(data.new_password)
    token_hash = hashlib.sha256(data.token.encode()).hexdigest()
    reset = await repo.get_reset_token(db, token_hash)
    if reset is None or reset.is_used or reset.expires_at < _now():
        raise ValidationError("Invalid or expired reset token.")

    user = await repo.get_user_by_id(db, reset.user_id)
    if user is None:
        raise ValidationError("Invalid or expired reset token.")
    await enforce_password_reuse(db, user, data.new_password)

    user.password_hash = hash_password(data.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    reset.is_used = True
    await repo.add_password_history(db, user.id, user.password_hash)
    await db.commit()
    # Log out every existing session for this user (FR-P-02: old sessions die).
    await tokens.bump_session_epoch(str(user.id))


async def enforce_password_reuse(db: AsyncSession, user: User, new_password: str) -> None:
    """Reject reuse of any of the user's last 3 passwords (shared by reset +
    change-password)."""
    recent = await repo.get_recent_password_hashes(db, user.id, PASSWORD_HISTORY_DEPTH)
    if any(verify_password(new_password, old) for old in recent):
        raise ValidationError("You cannot reuse one of your last 3 passwords.")


async def cleanup_expired(db: AsyncSession, now: datetime | None = None) -> tuple[int, int]:
    """Purge expired OTPs and password-reset tokens. Called by the
    APScheduler job in ``app/tasks/`` (docs/PROJECT_GUIDELINES.md deviation
    #14). Refresh-token replay entries need no cleanup here — they live in
    Redis with a TTL matching the refresh lifetime and expire on their own."""
    cutoff = now or datetime.now(UTC)
    otps = await repo.delete_expired_otps(db, cutoff)
    tokens_deleted = await repo.delete_expired_reset_tokens(db, cutoff)
    await db.commit()
    return otps, tokens_deleted
