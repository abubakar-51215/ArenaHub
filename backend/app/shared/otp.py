"""OTP + reset-token generation and delivery.

Codes/tokens are always real and validated; only *delivery* changes by
environment (deviation #7): in dev we log the code to the backend console
instead of sending email/SMS. Outside dev, delivery goes out over the same
SMTP integration the notification module uses (``app/integrations/email``).

Expiry durations live here (service-layer constants, not schema) so the auth
and user services share one definition.
"""

import asyncio
import secrets
from datetime import timedelta
from enum import StrEnum
from functools import partial

import structlog

from app.core.config import get_settings
from app.integrations.email import send_email
from app.integrations.email.templates import otp_email, reset_email

log = structlog.get_logger()

OTP_TTL = timedelta(minutes=10)
RESET_TOKEN_TTL = timedelta(minutes=30)
MAX_OTP_ATTEMPTS = 5


class OtpPurpose(StrEnum):
    """What an OTP row was issued for. Every lookup filters by purpose, so a code
    issued for one flow can never complete another (e.g. a registration code
    resetting a password)."""

    registration = "registration"
    password_reset = "password_reset"
    password_change = "password_change"
    phone_change = "phone_change"
    email_change = "email_change"
    admin_login = "admin_login"  # second sign-in step for admins


def generate_otp_code() -> str:
    """Return a cryptographically-random 6-digit numeric code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_reset_token() -> str:
    """Return a high-entropy URL-safe password-reset token (raw value)."""
    return secrets.token_urlsafe(32)


# Email sends run in the background. asyncio keeps only a weak reference to a
# task, so each one is held here until it finishes.
_send_tasks: set[asyncio.Task[None]] = set()


def _mail_configured() -> bool:
    settings = get_settings()
    return bool(settings.email_host and settings.email_password)


def _log_send_failure(task: asyncio.Task[None], *, kind: str, user_id: object) -> None:
    """Done-callback: log a failed send with what it was for and whose it was.
    Never the code, the token or the email text."""
    if task.cancelled():
        log.warning("otp_email_cancelled", kind=kind, user_id=str(user_id))
        return
    exc = task.exception()
    if exc is not None:
        log.error("otp_email_failed", kind=kind, user_id=str(user_id), error=type(exc).__name__)


def _send_in_background(
    destination: str, subject: str, text: str, html: str, *, kind: str, user_id: object
) -> None:
    task = asyncio.create_task(send_email(destination, subject, text, html=html))
    _send_tasks.add(task)
    task.add_done_callback(_send_tasks.discard)
    task.add_done_callback(partial(_log_send_failure, kind=kind, user_id=user_id))


def deliver_otp(destination: str, code: str, purpose: OtpPurpose, user_id: object) -> None:
    """Deliver an OTP as a branded HTML email. The code itself is written to the
    log only in dev with no mail server configured, so it can be read there;
    every other setting logs the request without the code. Whether the email
    actually goes out is decided inside ``send_email``."""
    if get_settings().is_dev and not _mail_configured():
        log.info("otp_dev_delivery", destination=destination, purpose=purpose, code=code)
    else:
        log.info("otp_delivery_requested", purpose=purpose, user_id=str(user_id))
    subject, text, html = otp_email(
        code,
        purpose.value,
        ttl_minutes=int(OTP_TTL.total_seconds() // 60),
        requested_by=destination,
    )
    _send_in_background(destination, subject, text, html, kind=purpose.value, user_id=user_id)


def deliver_reset_link(destination: str, token: str, user_id: object = None) -> None:
    """Deliver a password-reset token (same rule as OTPs: the token reaches the
    log only in dev with no mail server configured)."""
    if get_settings().is_dev and not _mail_configured():
        log.info("password_reset_dev_delivery", destination=destination, token=token)
    else:
        log.info("password_reset_requested", destination=destination)
    subject, text, html = reset_email(token, ttl_minutes=int(RESET_TOKEN_TTL.total_seconds() // 60))
    _send_in_background(
        destination, subject, text, html, kind="password_reset_link", user_id=user_id
    )
