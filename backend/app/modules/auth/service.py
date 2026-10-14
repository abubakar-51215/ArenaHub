"""Auth business logic: registration, OTP verification, login with lockout,
refresh rotation + replay detection, logout, and password reset.

All rules live here (services own logic + transactions); the repository only
runs queries, ``tokens`` holds the Redis session state, and ``security`` mints
the JWTs. Lockout, token lifetimes, and password policy follow FR-P-01/02.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    ConflictError,
    TooManyRequestsError,
    UnauthorizedError,
    ValidationError,
    VerifyEmailRequiredError,
)
from app.core.security import (
    ADMIN_LOGIN_TOKEN_TTL,
    TokenType,
    create_access_token,
    create_admin_login_token,
    create_refresh_token,
    decode_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.modules.auth import repository as repo
from app.modules.auth import tokens
from app.modules.auth.schema import (
    AdminCodeRequest,
    AdminLoginChallenge,
    AdminResendRequest,
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
from app.shared import codes
from app.shared.otp import OtpPurpose

LOGIN_MAX_ATTEMPTS = 5
LOCKOUT_DURATION = timedelta(minutes=15)
PASSWORD_HISTORY_DEPTH = 3

logger = logging.getLogger(__name__)

_INVALID_CREDENTIALS = "Invalid email/phone or password."
_ACCOUNT_LOCKED = "Your account has been locked. Please try again after 15 minutes."
_ACCOUNT_SUSPENDED = "Your account has been suspended."


def _now() -> datetime:
    return datetime.now(UTC)


def _issue_tokens(user: User) -> TokenResponse:
    """Mint a fresh access + refresh pair (new refresh-token family)."""
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


async def register(db: AsyncSession, data: RegisterRequest) -> RegisterResponse:
    """A new account, or a new start for one that was never confirmed.

    A confirmed account holding the email or the phone refuses ("... is already registered.").
    An account that was NEVER confirmed (nobody proved the email) is replaced instead: new name,
    email, password and role, its old codes and earlier passwords forgotten, a new code sent.
    This is how "Wrong email? Use a different email" works, and why a mistyped sign-up never
    blocks the real owner of that email or phone. The answer is the same as for a brand-new
    account, so nothing tells whether an unconfirmed account was there. The hourly code maximum
    still applies to the replaced account."""
    validate_password_strength(data.password)
    by_email = await repo.get_user_by_email(db, data.email)
    if by_email is not None and by_email.is_verified:
        raise ConflictError("Email is already registered.")
    by_phone = await repo.get_user_by_phone(db, data.phone)
    if by_phone is not None and by_phone.is_verified:
        raise ConflictError("Phone number is already registered.")

    password_hash = hash_password(data.password)
    replaced = by_phone or by_email
    if replaced is None:
        user = await repo.create_user(
            db,
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            password_hash=password_hash,
            role=UserRole(data.role),
        )
    else:
        recent = await repo.count_recent_otps(
            db, replaced.id, OtpPurpose.registration, timedelta(hours=1)
        )
        if recent >= codes.CODES_PER_HOUR:
            raise TooManyRequestsError(codes.TOO_MANY_CODES_MESSAGE)
        if by_email is not None and by_phone is not None and by_email.id != by_phone.id:
            # two never-confirmed sign-ups (one held this email, the other this phone): the
            # phone's account carries on and the other one goes (it owns nothing: it could not
            # sign in)
            await db.delete(by_email)
            await db.flush()
        user = replaced
        user.full_name = data.full_name
        user.email = data.email
        user.phone = data.phone
        user.password_hash = password_hash
        user.role = UserRole(data.role)
        user.pending_email = None
        user.pending_phone = None
        user.pending_password_hash = None
        user.failed_login_attempts = 0
        user.locked_until = None
        await repo.end_all_otps(db, user.id, _now())
        await repo.clear_password_history(db, user.id)
    await repo.add_password_history(db, user.id, password_hash)
    await db.commit()
    if replaced is not None:
        await tokens.bump_session_epoch(str(user.id))  # nothing can be open, but never trust it
    # the account exists even if the email cannot go out: the screen then offers Resend.
    # (No per-address wait starts here: a resend right after sign-up must look the same as
    # one for an address nobody used; the account's own 60 s rule keeps it quiet.)
    issued = await codes.issue_code(db, user.id, OtpPurpose.registration, user.email)
    return RegisterResponse(
        user=UserPublic.model_validate(user), otp_sent_to=issued.masked, code_sent=issued.delivered
    )


async def verify_otp(db: AsyncSession, data: OtpVerifyRequest) -> TokenResponse:
    user = await repo.get_user_by_email(db, data.email)
    if user is None:
        raise ValidationError(codes.WRONG_CODE_MESSAGE)
    if user.is_verified:
        raise ConflictError("Account is already verified.")

    await codes.check_code(db, user.id, OtpPurpose.registration, data.code, user.email)
    user.is_verified = True
    await db.commit()
    return _issue_tokens(user)


async def resend_otp(db: AsyncSession, email: str) -> bool:
    """A new sign-up code. Every address gets the same answers (the wait and the hourly
    maximum are counted per address first); the account is looked up only after that, and an
    unknown or already confirmed address simply gets nothing. Returns False when a code was made
    but its email could not be sent (logged; that try does not count). The route answers the
    same either way, so even an email outage does not tell whether an account exists."""
    await codes.throttle_public(OtpPurpose.registration, email)
    user = await repo.get_user_by_email(db, email)
    if user is None or user.is_verified or user.deleted_at is not None:
        return True
    issued = await codes.issue_code(db, user.id, OtpPurpose.registration, user.email, quiet=True)
    if not issued.delivered:
        await codes.forget_failed_public(OtpPurpose.registration, email)
    return issued.delivered


async def _register_failed_login(db: AsyncSession, user: User) -> None:
    user.failed_login_attempts += 1
    if user.failed_login_attempts >= LOGIN_MAX_ATTEMPTS:
        user.locked_until = _now() + LOCKOUT_DURATION
        user.failed_login_attempts = 0
    await db.commit()


async def _user_for_login(db: AsyncSession, who: str) -> User | None:
    """The account an email or a phone number points to. A text with "@" is an
    email; anything else is a phone. A phone shared by several accounts matches
    none (we never guess whose it is); the caller answers as for an unknown
    account."""
    if "@" in who:
        return await repo.get_user_by_email(db, who)
    matches = await repo.get_users_by_phone(db, who)
    if len(matches) > 1:
        logger.warning("Sign-in by phone refused: the number belongs to several accounts")
        return None
    return matches[0] if matches else None


async def login(db: AsyncSession, data: LoginRequest) -> TokenResponse | AdminLoginChallenge:
    user = await _user_for_login(db, data.who)
    if user is None or user.deleted_at is not None:
        raise UnauthorizedError(_INVALID_CREDENTIALS)
    if user.locked_until is not None and user.locked_until > _now():
        raise UnauthorizedError(_ACCOUNT_LOCKED)

    if not verify_password(data.password, user.password_hash):
        await _register_failed_login(db, user)
        raise UnauthorizedError(_INVALID_CREDENTIALS)
    if not user.is_active:
        # said only after the right password, so a stranger cannot learn which accounts exist
        raise UnauthorizedError(_ACCOUNT_SUSPENDED)
    if not user.is_verified:
        # the right password: send a fresh code (the 60 s wait permitting) and open the code screen
        issued = await codes.issue_code(
            db, user.id, OtpPurpose.registration, user.email, quiet=True
        )
        raise VerifyEmailRequiredError(
            data={"email": user.email, "sent_to": issued.masked, "code_sent": issued.delivered}
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()
    if user.role == UserRole.admin:
        # admins finish signing in with an emailed code: no tokens yet
        delivered = await _send_admin_code(db, user)
        return AdminLoginChallenge(
            challenge_token=create_admin_login_token(user.id),
            expires_in=int(ADMIN_LOGIN_TOKEN_TTL.total_seconds()),
            sent_to=codes.mask_address(user.email),
            code_sent=delivered,
        )
    return _issue_tokens(user)


_CHALLENGE_INVALID = "This sign-in step has expired or is not valid. Sign in again."


async def _send_admin_code(db: AsyncSession, user: User, *, asked_again: bool = False) -> bool:
    """Email a fresh admin sign-in code (the shared code rules). ``asked_again`` (the "Send a
    new code" button) answers "Wait N seconds ..." as well; at sign-in a code sent inside the
    last minute still works, so only the hourly maximum is said (the password was right, so
    nothing about the account is given away). Returns False when the email could not be sent."""
    try:
        issued = await codes.issue_code(db, user.id, OtpPurpose.admin_login, user.email)
    except TooManyRequestsError as exc:
        if asked_again or exc.message == codes.TOO_MANY_CODES_MESSAGE:
            raise
        return True  # inside the 60 s wait: the code sent a moment ago still works
    return issued.delivered


async def _challenge_user(db: AsyncSession, challenge_token: str) -> User:
    """The admin a sign-in challenge belongs to, or a plain error."""
    try:
        payload = decode_token(challenge_token, TokenType.admin_login)
    except UnauthorizedError as exc:
        raise UnauthorizedError(_CHALLENGE_INVALID) from exc
    user = await repo.get_user_by_id(db, uuid.UUID(payload["sub"]))
    if (
        user is None
        or user.deleted_at is not None
        or not user.is_active
        or user.role != UserRole.admin
        or await tokens.is_session_stale(str(user.id), payload)
    ):
        raise UnauthorizedError(_CHALLENGE_INVALID)
    return user


async def verify_admin_code(db: AsyncSession, data: AdminCodeRequest) -> TokenResponse:
    """Second step of an admin sign-in: the emailed code (OTP try limit and
    row lock), then the normal tokens."""
    user = await _challenge_user(db, data.challenge_token)
    await codes.check_code(db, user.id, OtpPurpose.admin_login, data.code, user.email)
    await db.commit()
    return _issue_tokens(user)


async def resend_admin_code(db: AsyncSession, data: AdminResendRequest) -> bool:
    user = await _challenge_user(db, data.challenge_token)
    return await _send_admin_code(db, user, asked_again=True)


async def refresh(db: AsyncSession, refresh_token: str) -> TokenResponse:
    payload = decode_token(refresh_token, TokenType.refresh)
    family, jti, user_id = payload["family"], payload["jti"], payload["sub"]

    if await tokens.is_family_revoked(family):
        raise UnauthorizedError("Session revoked, please log in again.")
    # Atomic check-and-set: the first caller to mark this jti wins; any
    # concurrent or later request presenting the same token sees it already
    # marked and is treated as a replay. This closes the race a plain
    # is_refresh_used-then-mark_refresh_used pair leaves open when two
    # requests race the read before either writes.
    if not await tokens.try_mark_refresh_used(jti):
        # Replay of a rotated (or concurrently-raced) token — kill the whole
        # family (deviation #17).
        await tokens.revoke_family(family)
        raise UnauthorizedError("Refresh token reuse detected; session revoked.")
    if await tokens.is_session_stale(user_id, payload):
        raise UnauthorizedError("Session expired, please log in again.")

    user = await repo.get_user_by_id(db, uuid.UUID(user_id))
    if user is None or user.deleted_at is not None or not user.is_active:
        raise UnauthorizedError("Account is not active.")

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
    """A 6-digit reset code. Never says whether the email exists: every address gets the same
    answers (the wait and the hourly maximum are counted per address first), and a send that
    fails is only logged."""
    await codes.throttle_public(OtpPurpose.password_reset, data.email)
    user = await repo.get_user_by_email(db, data.email)
    if user is None or user.deleted_at is not None:
        return
    issued = await codes.issue_code(db, user.id, OtpPurpose.password_reset, user.email, quiet=True)
    if not issued.delivered:
        await codes.forget_failed_public(OtpPurpose.password_reset, data.email)


async def reset_password(db: AsyncSession, data: ResetPasswordRequest) -> None:
    """The emailed code and a new password. Ends every session and refresh token."""
    validate_password_strength(data.new_password)
    user = await repo.get_user_by_email(db, data.email)
    if user is None or user.deleted_at is not None:
        raise ValidationError(codes.WRONG_CODE_MESSAGE)
    # a refused new password must not spend the code: check it first
    await enforce_password_reuse(db, user, data.new_password)
    await codes.check_code(db, user.id, OtpPurpose.password_reset, data.otp, user.email)

    user.password_hash = hash_password(data.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    await repo.add_password_history(db, user.id, user.password_hash)
    await db.commit()
    # every session and refresh token ends (FR-P-02)
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
