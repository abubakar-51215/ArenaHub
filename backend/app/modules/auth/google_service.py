"""Continue with Google (players on the phone only).

The phone sends the Google ID token; ``app.integrations.google`` checks it with Google's library
and gives back only what Google signed: the account id (``sub``), a verified email and the name.
Nothing else from the phone is trusted.

Who gets in:
* the account already linked to this Google account (by ``sub``, even if its Gmail changed);
* otherwise the account with that email:
  - an owner or an admin: refused, "This account must log in with email and password." (the same
    words for both, so no role is given away);
  - suspended: "Your account has been suspended.";
  - a confirmed player: signed in, and the Google account is linked;
  - a player sign-up that was NEVER confirmed: Google proves the email, so it is confirmed now.
    Someone else may have typed that email first, so its password is wiped (an unusable random
    one) and every session ends; "Forgot password" adds a password again;
* no account: a confirmed player account without a password and without a phone. The phone app
  then asks for the number ("One more step"); no booking until it is saved.

Sending the same token twice signs in twice (fine until it expires) but never makes two accounts.
"""

import asyncio
import secrets
from datetime import UTC, datetime

import structlog
from fastapi import BackgroundTasks
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AppError,
    ConflictError,
    ForbiddenError,
    ServiceUnavailableError,
    UnauthorizedError,
    ValidationError,
)
from app.core.security import create_access_token, hash_password
from app.integrations import google
from app.modules.auth import repository as repo
from app.modules.auth import sessions, tokens
from app.modules.auth.login_alert import dispatch_login_alert
from app.modules.auth.schema import GoogleSignInResponse
from app.modules.user.model import User, UserRole
from app.modules.user.schema import UserPublic
from app.shared.audit import audit
from app.shared.phone import phone_key

log = structlog.get_logger()

NOT_AVAILABLE = "Google sign-in is not available yet."
FAILED = "We could not sign you in with Google. Try again."
MUST_USE_PASSWORD = "This account must log in with email and password."
SUSPENDED = "Your account has been suspended."
PASSWORD_REMOVED = (
    "Your email is confirmed with Google. To also log in with a password, use Forgot password."
)


def _unusable_password() -> str:
    """A hash of a random secret nobody knows: no password works until "Forgot password"."""
    return hash_password(secrets.token_urlsafe(48)[:64])


async def _answer(
    db: AsyncSession,
    user: User,
    *,
    password_removed: bool = False,
    background: BackgroundTasks | None = None,
) -> GoogleSignInResponse:
    refresh = await sessions.issue(db, user.id)
    await audit(
        db, "auth.google", actor=user, target_type="user", target_id=user.id,
        details={"new_account": user.phone is None, "password_removed": password_removed},
    )  # fmt: skip
    await db.commit()
    # a successful Google sign-in: one alert email (players only, if they have an email).
    dispatch_login_alert(background, user, signed_in_with="Google")
    return GoogleSignInResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=refresh,
        phone_needed=user.phone is None,
        password_removed=password_removed,
        user=UserPublic.model_validate(user),
    )


async def _identity(id_token: str) -> google.GoogleIdentity:
    try:
        return await google.verify_id_token(id_token)
    except google.GoogleNotConfiguredError as exc:
        raise ServiceUnavailableError(NOT_AVAILABLE) from exc
    except google.GoogleTokenError as exc:
        raise UnauthorizedError(FAILED) from exc


async def sign_in(
    db: AsyncSession, id_token: str, background: BackgroundTasks | None = None
) -> GoogleSignInResponse:
    try:
        who = await _identity(id_token)
        try:
            return await _sign_in(db, who, background)
        except IntegrityError:
            # the same new person twice at once: the other request made the account; use it
            await db.rollback()
            return await _sign_in(db, who, background)
    except AppError as exc:
        await audit(
            db, "auth.google", result="fail", details={"reason": exc.message[:80]}, commit=True
        )
        raise


async def _sign_in(
    db: AsyncSession, who: google.GoogleIdentity, background: BackgroundTasks | None = None
) -> GoogleSignInResponse:
    user = await repo.get_user_by_google_sub(db, who.sub)
    if user is None:
        user = await repo.get_user_by_email(db, who.email)
        if user is not None and user.google_sub is not None and user.google_sub != who.sub:
            # that email is linked to a different Google account already
            log.info("google_sign_in_refused", reason="email linked to another Google account")
            raise UnauthorizedError(FAILED)

    if user is None:
        user = User(
            full_name=who.name,
            email=who.email,
            phone=None,
            password_hash=_unusable_password(),
            role=UserRole.player,
            is_verified=True,
            google_sub=who.sub,
        )
        db.add(user)
        await db.commit()
        log.info("google_account_created", user_id=str(user.id))
        return await _answer(db, user, background=background)

    if user.role != UserRole.player:
        raise ForbiddenError(MUST_USE_PASSWORD)
    if user.deleted_at is not None:
        raise UnauthorizedError(FAILED)
    if not user.is_active:
        raise UnauthorizedError(SUSPENDED)

    password_removed = False
    if not user.is_verified:
        # an unconfirmed sign-up with this email: Google proves the email is this person's, but the
        # password (and anything else) may have been set by someone else
        user.is_verified = True
        user.password_hash = _unusable_password()
        user.pending_email = user.pending_phone = user.pending_password_hash = None
        user.failed_login_attempts = 0
        user.locked_until = None
        await repo.end_all_otps(db, user.id, datetime.now(UTC))
        await sessions.revoke_all(db, user.id)
        await repo.clear_password_history(db, user.id)
        password_removed = True
    user.google_sub = who.sub
    await db.commit()
    if password_removed:
        await tokens.bump_session_epoch(str(user.id))
        # sessions issued at or before that moment are refused; the new ones come after it
        await asyncio.sleep(0.005)
        log.info("google_confirmed_unverified_account", user_id=str(user.id))
    return await _answer(db, user, password_removed=password_removed, background=background)


async def save_phone(db: AsyncSession, user: User, phone: str) -> UserPublic:
    """ "One more step": the phone of an account made by Google, with the sign-up rules."""
    if user.phone is not None:
        raise ConflictError("Your phone number is already saved.")
    digits = phone_key(phone)
    if not 10 <= len(digits) <= 15:
        raise ValidationError("Enter a valid phone number.")
    holder = await repo.get_user_by_phone(db, phone)
    if holder is not None and holder.id != user.id:
        if holder.is_verified:
            raise ConflictError("Phone number is already registered.")
        # a sign-up with this number that was never confirmed gives way (the sign-up rule)
        await db.delete(holder)
        await db.flush()
    user.phone = phone.strip()
    await db.commit()
    return UserPublic.model_validate(user)
