"""The "login alert" email a player or arena owner gets after a real sign-in.

Started as a background task (from ``service.login`` for a password sign-in and from
``google_service`` for a Google sign-in), so the sign-in answer never waits for the mail and a
mail that fails (or takes too long) never changes the answer. It is sent only after a successful
sign-in that issues tokens — never on a wrong password, a token refresh, a sign-up, or an
emailed-code step. Admins are excluded (they finish with a second emailed code instead).

Each account is capped at ``ALERT_MAX_PER_HOUR`` alert emails per hour; sign-ins past that in the
hour send nothing and are not an error (only a skip is logged, never the address). The player alert
also obeys the ``PLAYER_LOGIN_ALERT_ENABLED`` emergency switch (on by default).

The Device and IP address shown in the email are read once, synchronously, from the request that
is signing in (``current_user_agent``/``current_client_ip``, set by ``RequestContextMiddleware``)
— before the background task is even scheduled. Neither is ever written to a database row or a
log line; an unreadable value becomes "Not available" (``device.NOT_AVAILABLE``).
"""

import uuid
from datetime import UTC, datetime

import structlog
from fastapi import BackgroundTasks

from app.core.config import get_settings
from app.core.request_context import current_client_ip, current_user_agent
from app.integrations.email import send_email
from app.integrations.email.templates import owner_login_alert_email, player_login_alert_email
from app.modules.user.model import User, UserRole
from app.shared import abuse
from app.shared.codes import mask_address
from app.shared.device import NOT_AVAILABLE, describe_device
from app.shared.display import karachi_stamp

log = structlog.get_logger()

ALERT_MAX_PER_HOUR = 5


def dispatch_login_alert(
    background: BackgroundTasks | None, user: User, *, signed_in_with: str
) -> None:
    """Schedule the one login-alert email for a just-succeeded sign-in, or nothing.

    Nothing is scheduled for an admin, for a player when the switch is off, or for an account with
    no email address. Owners always get theirs. The per-hour cap is enforced inside the task.
    ``signed_in_with`` is "Password" or "Google" (never guessed here).
    """
    if background is None or user.role == UserRole.admin:
        return
    if not user.email:  # a Google/phone account with no email gets nothing, and no error
        return
    now = datetime.now(UTC)
    # read once, synchronously, inside the request that is signing in — not inside the
    # background task, where there is no request to read a header or a connection from
    ip = current_client_ip() or NOT_AVAILABLE
    device = describe_device(current_user_agent())
    if user.role == UserRole.owner:
        background.add_task(
            send_owner_login_alert, user.id, user.full_name, user.email, now, signed_in_with,
            device, ip,
        )  # fmt: skip
    elif user.role == UserRole.player and get_settings().player_login_alert_enabled:
        background.add_task(
            send_player_login_alert, user.id, user.full_name, user.email, now, signed_in_with,
            device, ip,
        )  # fmt: skip


async def _within_hourly_cap(user_id: uuid.UUID, role: str) -> bool:
    """True if this account may send another alert this hour; logs a skip (no address) when not."""
    if await abuse.allow("login_alert", str(user_id), ALERT_MAX_PER_HOUR, 3600):
        return True
    log.info("login_alert_skipped", role=role)  # over the hourly cap; never the address
    return False


async def send_owner_login_alert(
    owner_id: uuid.UUID,
    name: str,
    email: str,
    when: datetime,
    signed_in_with: str,
    device: str,
    ip: str,
) -> None:
    if not await _within_hourly_cap(owner_id, "owner"):
        return
    try:
        subject, text, html = owner_login_alert_email(
            name, email, karachi_stamp(when), signed_in_with, device, ip,
            get_settings().support_email,
        )  # fmt: skip
        await send_email(email, subject, text, html=html, kind="owner_login_alert")
    except Exception as exc:  # noqa: BLE001 - never raise out of a background task
        # one safe line: who (id), what kind of failure, and a masked address; never the body
        log.warning(
            "owner_login_alert_failed",
            owner_id=str(owner_id),
            error=type(exc).__name__,
            address=mask_address(email),
        )


async def send_player_login_alert(
    player_id: uuid.UUID,
    name: str,
    email: str,
    when: datetime,
    signed_in_with: str,
    device: str,
    ip: str,
) -> None:
    if not await _within_hourly_cap(player_id, "player"):
        return
    try:
        subject, text, html = player_login_alert_email(
            name, email, karachi_stamp(when), signed_in_with, device, ip,
            get_settings().support_email,
        )  # fmt: skip
        await send_email(email, subject, text, html=html, kind="player_login_alert")
    except Exception as exc:  # noqa: BLE001 - never raise out of a background task
        # one safe line: who (id), what kind of failure, and a masked address; never the body
        log.warning(
            "player_login_alert_failed",
            player_id=str(player_id),
            error=type(exc).__name__,
            address=mask_address(email),
        )


__all__ = ["dispatch_login_alert", "send_owner_login_alert", "send_player_login_alert"]
