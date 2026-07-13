"""User/profile business logic: profile read/update, password change,
soft-delete, and phone-change via OTP (doc 10 §2, MASTER plan Track A).

Reuses the auth module's password-history, reuse-check, OTP, and Redis session
helpers so the security rules have a single implementation.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.core.security import hash_password, validate_password_strength, verify_password
from app.modules.auth import repository as auth_repo
from app.modules.auth import tokens
from app.modules.auth.service import enforce_password_reuse
from app.modules.user.model import User
from app.modules.user.schema import (
    ChangePasswordRequest,
    ChangePasswordVerifyRequest,
    EmailChangeRequest,
    EmailChangeVerifyRequest,
    PhoneChangeRequest,
    PhoneChangeVerifyRequest,
    UpdateProfileRequest,
    UserPublic,
)
from app.shared.otp import MAX_OTP_ATTEMPTS, OTP_TTL, deliver_otp, generate_otp_code


def _now() -> datetime:
    return datetime.now(UTC)


def get_profile(user: User) -> UserPublic:
    return UserPublic.model_validate(user)


async def update_profile(db: AsyncSession, user: User, data: UpdateProfileRequest) -> UserPublic:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    return UserPublic.model_validate(user)


async def request_password_change(
    db: AsyncSession, user: User, data: ChangePasswordRequest
) -> None:
    """Validate the new password and stage it; the change only applies once the
    OTP sent to the user's current email is confirmed via ``verify_password_change``."""
    if not verify_password(data.current_password, user.password_hash):
        raise ValidationError("Current password is incorrect.")
    validate_password_strength(data.new_password)
    await enforce_password_reuse(db, user, data.new_password)

    user.pending_password_hash = hash_password(data.new_password)
    code = generate_otp_code()
    await auth_repo.create_otp(
        db, user_id=user.id, code=code, channel="email", expires_at=_now() + OTP_TTL
    )
    await db.commit()
    deliver_otp(user.email, code, purpose="password_change")


async def verify_password_change(
    db: AsyncSession, user: User, data: ChangePasswordVerifyRequest
) -> None:
    if user.pending_password_hash is None:
        raise ValidationError("No password change is pending.")

    otp = await auth_repo.get_latest_otp(db, user.id)
    if otp is None or otp.expires_at < _now():
        raise ValidationError("Invalid or expired verification code.")
    if otp.attempts >= MAX_OTP_ATTEMPTS:
        raise ValidationError("Too many incorrect attempts. Request a new code.")
    if otp.code != data.code:
        otp.attempts += 1
        await db.commit()
        raise ValidationError("Invalid or expired verification code.")

    otp.is_used = True
    user.password_hash = user.pending_password_hash
    user.pending_password_hash = None
    await auth_repo.add_password_history(db, user.id, user.password_hash)
    await db.commit()
    # Changing the password logs out all existing sessions (incl. this one).
    await tokens.bump_session_epoch(str(user.id))


async def delete_account(db: AsyncSession, user: User) -> None:
    """Soft-delete with a grace window: mark deleted + deactivate; a scheduled
    job purges later. Sessions are invalidated immediately."""
    user.deleted_at = _now()
    user.is_active = False
    await db.commit()
    await tokens.bump_session_epoch(str(user.id))


async def request_phone_change(db: AsyncSession, user: User, data: PhoneChangeRequest) -> None:
    if data.new_phone == user.phone:
        raise ValidationError("That is already your phone number.")
    if await auth_repo.get_user_by_phone(db, data.new_phone):
        raise ConflictError("Phone number is already registered.")

    user.pending_phone = data.new_phone
    code = generate_otp_code()
    await auth_repo.create_otp(
        db, user_id=user.id, code=code, channel="sms", expires_at=_now() + OTP_TTL
    )
    await db.commit()
    deliver_otp(data.new_phone, code, purpose="phone_change")


async def verify_phone_change(
    db: AsyncSession, user: User, data: PhoneChangeVerifyRequest
) -> UserPublic:
    if user.pending_phone is None:
        raise ValidationError("No phone change is pending.")

    otp = await auth_repo.get_latest_otp(db, user.id)
    if otp is None or otp.expires_at < _now():
        raise ValidationError("Invalid or expired verification code.")
    if otp.attempts >= MAX_OTP_ATTEMPTS:
        raise ValidationError("Too many incorrect attempts. Request a new code.")
    if otp.code != data.code:
        otp.attempts += 1
        await db.commit()
        raise ValidationError("Invalid or expired verification code.")

    otp.is_used = True
    user.phone = user.pending_phone
    user.pending_phone = None
    await db.commit()
    return UserPublic.model_validate(user)


async def request_email_change(db: AsyncSession, user: User, data: EmailChangeRequest) -> None:
    if data.new_email == user.email:
        raise ValidationError("That is already your email address.")
    if await auth_repo.get_user_by_email(db, data.new_email):
        raise ConflictError("Email address is already registered.")

    user.pending_email = data.new_email
    code = generate_otp_code()
    await auth_repo.create_otp(
        db, user_id=user.id, code=code, channel="email", expires_at=_now() + OTP_TTL
    )
    await db.commit()
    deliver_otp(data.new_email, code, purpose="email_change")


async def verify_email_change(
    db: AsyncSession, user: User, data: EmailChangeVerifyRequest
) -> UserPublic:
    if user.pending_email is None:
        raise ValidationError("No email change is pending.")

    otp = await auth_repo.get_latest_otp(db, user.id)
    if otp is None or otp.expires_at < _now():
        raise ValidationError("Invalid or expired verification code.")
    if otp.attempts >= MAX_OTP_ATTEMPTS:
        raise ValidationError("Too many incorrect attempts. Request a new code.")
    if otp.code != data.code:
        otp.attempts += 1
        await db.commit()
        raise ValidationError("Invalid or expired verification code.")

    otp.is_used = True
    user.email = user.pending_email
    user.pending_email = None
    await db.commit()
    return UserPublic.model_validate(user)
