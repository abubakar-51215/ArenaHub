"""Emailed 6-digit codes: one set of rules for every purpose.

* Only a keyed hash is stored: HMAC-SHA256 (``CODE_HASH_SECRET``) over the purpose, the user,
  the address the code was sent to, and the code. A code is bound to its purpose and user,
  and for a change of email to the new address: it never works anywhere else. Checked in
  constant time (``hmac.compare_digest``).
* One active code per user and purpose: a new code ends the older ones. Single use. 10 minutes.
* Wrong tries: the code locks after 5 ("Too many wrong tries. Ask for a new code.").
* Asking again: 60 s between codes ("Wait N seconds ...") and at most 5 codes an hour
  ("Too many codes ..."). A send that failed does not count.
* Public flows (sign-up resend, forgot password) are throttled per address in Redis before the
  account is even looked up, so a known and an unknown address get the same answers.
* The send is awaited (8 s, one retry on a temporary failure); a failure is recorded on the row
  and reported to the caller, so the screen can say "We could not send the code. Tap Resend."
* The code reaches the log only in dev (``code_dev_delivery``), so testing never gets stuck;
  outside dev neither the code nor its hash is ever logged.
"""

import hashlib
import hmac
import math
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import redis as redis_cache
from app.core.config import get_settings
from app.core.exceptions import TooManyRequestsError, ValidationError
from app.integrations.email.smtp import EmailSendError, send_email
from app.integrations.email.templates import code_email
from app.modules.auth import repository as repo
from app.modules.auth.model import OtpVerification
from app.shared.otp import OtpPurpose

log = structlog.get_logger()

CODE_TTL = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_WRONG_TRIES = 5
CODES_PER_HOUR = 5

WAIT_MESSAGE = "Wait {seconds} seconds before asking for another code."
TOO_MANY_CODES_MESSAGE = "Too many codes were asked for. Please try again in 30 minutes."
WRONG_CODE_MESSAGE = "That code is not right, or it has expired."
LOCKED_MESSAGE = "Too many wrong tries. Ask for a new code."
NOT_SENT_MESSAGE = "We could not send the code. Tap Resend."


@dataclass
class Issued:
    """What happened when a code was asked for."""

    sent: bool  # a new code was made (False: inside the cooldown of a quiet flow)
    delivered: bool  # it went out (or was logged in dev); False = the send failed
    masked: str


def mask_address(address: str) -> str:
    """a***@gmail.com (a phone number keeps its last 3 digits)."""
    if "@" not in address:
        return f"{'*' * max(0, len(address) - 3)}{address[-3:]}"
    local, _, domain = address.partition("@")
    return f"{local[:1]}***@{domain}"


def code_hash(code: str, *, user_id: uuid.UUID, purpose: OtpPurpose, destination: str) -> str:
    key = get_settings().code_hash_secret.get_secret_value().encode()
    message = f"{purpose.value}|{user_id}|{destination.strip().lower()}|{code}".encode()
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _now() -> datetime:
    return datetime.now(UTC)


def _created(otp: OtpVerification) -> datetime:
    return otp.expires_at - CODE_TTL


# ---- dev only: the last code per user and purpose, for tests and local runs ---------------------

_DEV_OUTBOX: dict[tuple[str, str], str] = {}


def dev_last_code(user_id: uuid.UUID, purpose: OtpPurpose) -> str | None:
    """The newest code made for a user and purpose. Kept only in dev; None elsewhere."""
    if not get_settings().is_dev:
        return None
    return _DEV_OUTBOX.get((str(user_id), purpose.value))


# ---- public flows: the same answers for every address -------------------------------------------


def _throttle_key(purpose: OtpPurpose, address: str) -> str:
    digest = hashlib.sha256(address.strip().lower().encode()).hexdigest()[:32]
    return f"codes:{purpose.value}:{digest}"


async def throttle_public(purpose: OtpPurpose, address: str) -> None:
    """For flows anyone can call with any address (resend a sign-up code, forgot password):
    the 60 s wait and the hourly maximum are counted per address before the account is looked
    up, so a known and an unknown address get exactly the same answers."""
    client = redis_cache.get_redis()
    key = _throttle_key(purpose, address)
    try:
        ttl = await client.ttl(f"{key}:cool")
        if ttl and ttl > 0:
            raise TooManyRequestsError(WAIT_MESSAGE.format(seconds=ttl))
        count = await client.incr(f"{key}:hour")
        if count == 1:
            await client.expire(f"{key}:hour", 3600)
        if count > CODES_PER_HOUR:
            raise TooManyRequestsError(TOO_MANY_CODES_MESSAGE)
        await client.set(f"{key}:cool", "1", ex=int(RESEND_COOLDOWN.total_seconds()))
    except TooManyRequestsError:
        raise
    except Exception as exc:  # noqa: BLE001 - the per-account rules below still apply
        log.warning("code_throttle_unavailable", error=type(exc).__name__)


async def forget_failed_public(purpose: OtpPurpose, address: str) -> None:
    """A send that failed does not count: the next resend is allowed at once."""
    client = redis_cache.get_redis()
    key = _throttle_key(purpose, address)
    try:
        await client.delete(f"{key}:cool")
        await client.decr(f"{key}:hour")
    except Exception:  # noqa: BLE001
        pass


# ---- issue and check -------------------------------------------------------------------------


async def issue_code(
    db: AsyncSession,
    user_id: uuid.UUID,
    purpose: OtpPurpose,
    destination: str,
    *,
    quiet: bool = False,
) -> Issued:
    """Make a new code, end the older ones, store its hash and send it.

    The 60 s wait and the hourly maximum count only codes that went out. ``quiet``: inside the
    wait or over the maximum, send nothing and say nothing (sign-in starting an admin or
    verification code; public flows throttle before calling this)."""
    masked = mask_address(destination)
    latest = await repo.get_latest_otp(db, user_id, purpose, for_update=True)
    if latest is not None and not latest.delivery_failed:
        since = _now() - _created(latest)
        if since < RESEND_COOLDOWN:
            await db.commit()  # release the row lock
            if quiet:
                return Issued(sent=False, delivered=True, masked=masked)
            seconds = max(1, math.ceil((RESEND_COOLDOWN - since).total_seconds()))
            raise TooManyRequestsError(WAIT_MESSAGE.format(seconds=seconds))
    if await repo.count_recent_otps(db, user_id, purpose, timedelta(hours=1)) >= CODES_PER_HOUR:
        await db.commit()
        if quiet:
            return Issued(sent=False, delivered=True, masked=masked)
        raise TooManyRequestsError(TOO_MANY_CODES_MESSAGE)

    await repo.end_active_otps(db, user_id, purpose, _now())
    code = generate_code()
    otp = await repo.create_otp(
        db,
        user_id=user_id,
        code_hash=code_hash(code, user_id=user_id, purpose=purpose, destination=destination),
        channel="email" if "@" in destination else "sms",
        purpose=purpose,
        expires_at=_now() + CODE_TTL,
    )
    await db.commit()
    delivered = await _deliver(destination, code, purpose, user_id)
    if not delivered:
        otp.delivery_failed = True
        await db.commit()
    return Issued(sent=True, delivered=delivered, masked=masked)


async def _deliver(destination: str, code: str, purpose: OtpPurpose, user_id: uuid.UUID) -> bool:
    settings = get_settings()
    if settings.is_dev:
        # dev only: the code in the backend terminal, so a test never waits for an inbox
        _DEV_OUTBOX[(str(user_id), purpose.value)] = code
        log.info("code_dev_delivery", destination=destination, purpose=purpose.value, code=code)
    if "@" not in destination:
        # a phone number: there is no SMS provider yet
        if settings.is_dev:
            return True
        log.error(
            "code_not_sent", purpose=purpose.value, user_id=str(user_id), reason="no SMS provider"
        )
        return False
    subject, text, html = code_email(
        code, purpose.value, ttl_minutes=int(CODE_TTL.total_seconds() // 60)
    )
    try:
        await send_email(destination, subject, text, html=html, kind=f"code:{purpose.value}")
    except EmailSendError as err:
        log.error(
            "code_not_sent",
            purpose=purpose.value,
            user_id=str(user_id),
            reason=err.reason,
            hint=err.hint,
        )
        return False
    return True


async def check_code(
    db: AsyncSession, user_id: uuid.UUID, purpose: OtpPurpose, code: str, destination: str
) -> OtpVerification:
    """The user's active code for this purpose, if ``code`` is it. Wrong tries count on the
    code (locked after 5). The row is locked while it is checked, so two tries at once cannot
    both slip under the limit. Marks it used (the caller commits with its own change)."""
    otp = await repo.get_latest_otp(db, user_id, purpose, for_update=True)
    if otp is None or otp.expires_at < _now():
        raise ValidationError(WRONG_CODE_MESSAGE)
    if otp.attempts >= MAX_WRONG_TRIES:
        raise ValidationError(LOCKED_MESSAGE)
    expected = code_hash(code.strip(), user_id=user_id, purpose=purpose, destination=destination)
    if not hmac.compare_digest(otp.code_hash, expected):
        otp.attempts += 1
        await db.commit()
        raise ValidationError(
            LOCKED_MESSAGE if otp.attempts >= MAX_WRONG_TRIES else WRONG_CODE_MESSAGE
        )
    otp.used_at = _now()
    return otp
