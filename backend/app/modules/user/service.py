"""User/profile business logic: profile read/update, password change,
soft-delete, and phone-change via OTP (doc 10 §2, MASTER plan Track A).

Reuses the auth module's password-history, reuse-check, OTP, and Redis session
helpers so the security rules have a single implementation.
"""

import contextlib
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.core.security import hash_password, validate_password_strength, verify_password
from app.integrations.email import send_email
from app.integrations.email.smtp import EmailSendError
from app.integrations.email.templates import email_changed_email, password_changed_email
from app.modules.auth import login_guard, sessions, tokens
from app.modules.auth import repository as auth_repo
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
from app.shared import codes
from app.shared.audit import audit
from app.shared.otp import OtpPurpose


def _now() -> datetime:
    return datetime.now(UTC)


def get_profile(user: User) -> UserPublic:
    return UserPublic.model_validate(user)


async def update_profile(db: AsyncSession, user: User, data: UpdateProfileRequest) -> UserPublic:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    return UserPublic.model_validate(user)


async def _check_current_password(db: AsyncSession, user: User, password: str) -> None:
    """The "current password" asked again before a sensitive change: wrong tries wait like a
    sign-in does, and are written to the audit trail."""
    who = f"acct:{user.id}"
    await login_guard.check(who)
    if not verify_password(password, user.password_hash):
        await login_guard.failed(who)
        await audit(
            db, "auth.password_check", actor=user, target_type="user", target_id=user.id,
            result="fail", commit=True,
        )  # fmt: skip
        raise ValidationError("Current password is incorrect.")
    await login_guard.succeeded(who)


async def request_password_change(
    db: AsyncSession, user: User, data: ChangePasswordRequest
) -> bool:
    """Check the current password, stage the new one, and email a code to the account's
    address; the change applies once the code is confirmed. Returns False when the email
    could not be sent."""
    await _check_current_password(db, user, data.current_password)
    validate_password_strength(data.new_password)
    await enforce_password_reuse(db, user, data.new_password)

    user.pending_password_hash = hash_password(data.new_password)
    await db.commit()
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.password_change, user.email, name=user.full_name
    )
    return issued.delivered


async def verify_password_change(
    db: AsyncSession, user: User, data: ChangePasswordVerifyRequest
) -> None:
    if user.pending_password_hash is None:
        raise ValidationError("No password change is pending.")
    await codes.check_code(db, user.id, OtpPurpose.password_change, data.code, user.email)
    user.password_hash = user.pending_password_hash
    user.pending_password_hash = None
    await auth_repo.add_password_history(db, user.id, user.password_hash)
    await sessions.revoke_all(db, user.id)
    await audit(db, "password.change", actor=user, target_type="user", target_id=user.id)
    await db.commit()
    # Changing the password logs out all existing sessions (incl. this one).
    await tokens.bump_session_epoch(str(user.id))
    subject, text, html = password_changed_email(datetime.now(UTC))
    with contextlib.suppress(EmailSendError):  # logged with its reason; the change stands
        await send_email(user.email, subject, text, html=html, kind="password_changed")


async def delete_account(db: AsyncSession, user: User) -> None:
    """Soft-delete with a grace window: mark deleted + deactivate; a scheduled
    job purges later. Sessions are invalidated immediately."""
    from app.modules.booking import repository as booking_repo

    if await booking_repo.count_open_bookings_for_player(db, user.id, datetime.now()) > 0:
        raise ConflictError(
            "You still have upcoming or unpaid bookings. Cancel them or wait until they are "
            "done, then delete your account."
        )
    user.deleted_at = _now()
    user.is_active = False
    await sessions.revoke_all(db, user.id)
    await db.commit()
    await tokens.bump_session_epoch(str(user.id))


async def request_phone_change(db: AsyncSession, user: User, data: PhoneChangeRequest) -> bool:
    if data.new_phone == user.phone:
        raise ValidationError("That is already your phone number.")
    if await auth_repo.get_user_by_phone(db, data.new_phone):
        raise ConflictError("Phone number is already registered.")

    user.pending_phone = data.new_phone
    await db.commit()
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.phone_change, data.new_phone, name=user.full_name
    )
    return issued.delivered


async def verify_phone_change(
    db: AsyncSession, user: User, data: PhoneChangeVerifyRequest
) -> UserPublic:
    if user.pending_phone is None:
        raise ValidationError("No phone change is pending.")
    await codes.check_code(db, user.id, OtpPurpose.phone_change, data.code, user.pending_phone)
    user.phone = user.pending_phone
    user.pending_phone = None
    await audit(db, "phone.change", actor=user, target_type="user", target_id=user.id)
    await db.commit()
    return UserPublic.model_validate(user)


async def request_email_change(db: AsyncSession, user: User, data: EmailChangeRequest) -> bool:
    """Check the password again, then send a code to the NEW address. The old address stays
    until that code is accepted. Returns False when the email could not be sent."""
    await _check_current_password(db, user, data.current_password)
    if data.new_email == user.email:
        raise ValidationError("That is already your email address.")
    if await auth_repo.get_user_by_email(db, data.new_email):
        raise ConflictError("Email address is already registered.")

    user.pending_email = data.new_email
    await db.commit()
    issued = await codes.issue_code(
        db, user.id, OtpPurpose.email_change, data.new_email, name=user.full_name
    )
    return issued.delivered


async def verify_email_change(
    db: AsyncSession, user: User, data: EmailChangeVerifyRequest
) -> UserPublic:
    """The code sent to the new address (it works only for that address). Then the old
    address is told about the change."""
    if user.pending_email is None:
        raise ValidationError("No email change is pending.")
    await codes.check_code(db, user.id, OtpPurpose.email_change, data.code, user.pending_email)
    old_email = user.email
    user.email = user.pending_email
    user.pending_email = None
    await audit(db, "email.change", actor=user, target_type="user", target_id=user.id)
    await db.commit()
    subject, text, html = email_changed_email(codes.mask_address(user.email), datetime.now(UTC))
    with contextlib.suppress(EmailSendError):  # logged with its reason; the change stands
        await send_email(old_email, subject, text, html=html, kind="email_changed")
    return UserPublic.model_validate(user)
