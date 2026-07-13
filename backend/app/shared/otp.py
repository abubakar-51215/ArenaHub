"""OTP + reset-token generation and delivery.

Codes/tokens are always real and validated; only *delivery* changes by
environment (deviation #7): in dev we log the code to the backend console
instead of sending email/SMS. Real email delivery lands with the notification
module — ``deliver_otp`` is the single seam it will plug into.

Expiry durations live here (service-layer constants, not schema) so the auth
and user services share one definition.
"""

import secrets
from datetime import timedelta

import structlog

from app.core.config import get_settings

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
    """Deliver an OTP. Dev logs it to the console; prod email is wired later."""
    settings = get_settings()
    if settings.is_dev:
        log.info("otp_dev_delivery", destination=destination, purpose=purpose, code=code)
    else:
        # Real SMTP/SendGrid delivery arrives with the notification module.
        log.info("otp_delivery_requested", destination=destination, purpose=purpose)


def deliver_reset_link(destination: str, token: str) -> None:
    """Deliver a password-reset token. Dev logs it to the console."""
    settings = get_settings()
    if settings.is_dev:
        log.info("password_reset_dev_delivery", destination=destination, token=token)
    else:
        log.info("password_reset_requested", destination=destination)
