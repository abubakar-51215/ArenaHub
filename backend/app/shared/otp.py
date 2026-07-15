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
    """Deliver an OTP. Dev logs it to the console; elsewhere it's emailed."""
    settings = get_settings()
    if settings.is_dev:
        log.info("otp_dev_delivery", destination=destination, purpose=purpose, code=code)
        return
    log.info("otp_delivery_requested", destination=destination, purpose=purpose)
    asyncio.create_task(
        send_email(
            destination,
            "Your ArenaHub verification code",
            f"Your {purpose} code is {code}. It expires in 10 minutes.",
        )
    )


def deliver_reset_link(destination: str, token: str) -> None:
    """Deliver a password-reset token. Dev logs it to the console."""
    settings = get_settings()
    if settings.is_dev:
        log.info("password_reset_dev_delivery", destination=destination, token=token)
        return
    log.info("password_reset_requested", destination=destination)
    asyncio.create_task(
        send_email(
            destination,
            "Reset your ArenaHub password",
            f"Your password reset token is {token}. It expires in 30 minutes.",
        )
    )
