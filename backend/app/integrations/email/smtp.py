"""SMTP email delivery (docs/PROJECT_GUIDELINES.md deviation #7).

Dev has no ``EMAIL_HOST`` configured -> logs the message instead of opening a
real SMTP connection, same seam as ``shared/otp.py``'s console delivery.
``smtplib`` is synchronous, so the actual send runs in a worker thread via
``asyncio.to_thread`` to avoid blocking the event loop.
"""

import asyncio
import smtplib
from email.message import EmailMessage

import structlog

from app.core.config import get_settings

log = structlog.get_logger()


def _send_sync(
    host: str, port: int, username: str | None, password: str, msg: EmailMessage
) -> None:
    with smtplib.SMTP(host, port, timeout=10) as client:
        client.starttls()
        if username:
            client.login(username, password)
        client.send_message(msg)


async def send_email(to: str, subject: str, body: str, html: str | None = None) -> None:
    """Send an email — plain text, plus a branded HTML alternative when given
    (multipart/alternative: clients render the HTML, text is the fallback).
    Dev logs instead of connecting; prod raises on SMTP failure so the caller
    can decide whether to swallow or surface it."""
    settings = get_settings()
    if not settings.email_host or not settings.email_password:
        log.info("email_dev_delivery", to=to, subject=subject, html=html is not None)
        return

    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html is not None:
        msg.add_alternative(html, subtype="html")

    await asyncio.to_thread(
        _send_sync,
        settings.email_host,
        settings.email_port,
        settings.email_username,
        settings.email_password,
        msg,
    )
