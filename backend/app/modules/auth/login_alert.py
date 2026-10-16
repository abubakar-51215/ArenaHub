"""The "login alert" email an arena owner gets after signing in (owners only).

It is started from ``service.login`` as a background task, so the sign-in answer never waits for
the mail and a mail that fails (or takes too long) never changes the answer. One sign-in schedules
one task; token refresh, failed or refused sign-ins, players and admins never reach this.
"""

import uuid
from datetime import datetime

import structlog

from app.core.config import get_settings
from app.integrations.email import send_email
from app.integrations.email.templates import owner_login_alert_email, player_login_alert_email
from app.shared.codes import mask_address
from app.shared.display import karachi_stamp

log = structlog.get_logger()


async def send_owner_login_alert(
    owner_id: uuid.UUID, name: str, email: str, when: datetime
) -> None:
    try:
        subject, text, html = owner_login_alert_email(
            name, karachi_stamp(when), get_settings().support_email
        )
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
    player_id: uuid.UUID, name: str, email: str, when: datetime
) -> None:
    try:
        subject, text, html = player_login_alert_email(
            name, karachi_stamp(when), get_settings().support_email
        )
        await send_email(email, subject, text, html=html, kind="player_login_alert")
    except Exception as exc:  # noqa: BLE001 - never raise out of a background task
        # one safe line: who (id), what kind of failure, and a masked address; never the body
        log.warning(
            "player_login_alert_failed",
            player_id=str(player_id),
            error=type(exc).__name__,
            address=mask_address(email),
        )
