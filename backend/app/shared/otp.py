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

import structlog

from app.core.config import get_settings
from app.integrations.email import send_email
from app.integrations.email.templates import otp_email, reset_email

log = structlog.get_logger()

OTP_TTL = timedelta(minutes=10)
RESET_TOKEN_TTL = timedelta(minutes=30)
MAX_OTP_ATTEMPTS = 5


def generate_otp_code() -> str:
    """Return a cryptographically-random 6-digit numeric code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_reset_token() -> str:
    """Return a high-entropy URL-safe password-reset token (raw value)."""
    return secrets.token_urlsafe(32)


def deliver_otp(destination: str, code: str, purpose: str = "verification") -> None:
    """Deliver an OTP as a branded HTML email. Dev also logs the code to the
    console; whether the email actually goes out is decided inside
    ``send_email`` (credentials present + EMAIL_SEND_IN_DEV honoured)."""
    settings = get_settings()
    if settings.is_dev:
        log.info("otp_dev_delivery", destination=destination, purpose=purpose, code=code)
    else:
        log.info("otp_delivery_requested", destination=destination, purpose=purpose)
    subject, text, html = otp_email(code, purpose, ttl_minutes=int(OTP_TTL.total_seconds() // 60))
    asyncio.create_task(send_email(destination, subject, text, html=html))


def deliver_reset_link(destination: str, token: str) -> None:
    """Deliver a password-reset token (same delivery gating as OTPs)."""
    settings = get_settings()
    if settings.is_dev:
        log.info("password_reset_dev_delivery", destination=destination, token=token)
    else:
        log.info("password_reset_requested", destination=destination)
    subject, text, html = reset_email(token, ttl_minutes=int(RESET_TOKEN_TTL.total_seconds() // 60))
    asyncio.create_task(send_email(destination, subject, text, html=html))
