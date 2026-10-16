"""SMTP email delivery (docs/PROJECT_GUIDELINES.md deviation #7).

Two modes, decided by the settings and logged once at start-up (``email_mode``):

* ``smtp``: a real SMTP connection (STARTTLS on 587, SSL on 465).
* ``console``: nothing is sent; dev writes a short line instead. The reason is
  said: no EMAIL_HOST, no EMAIL_PASSWORD, or dev without EMAIL_SEND_IN_DEV.

A failed send is never silent: ``EmailSendError`` carries a plain reason (login
refused 535, cannot connect or timed out, TLS failed, sender refused, ...) and a
one-line hint. A temporary failure (timeout, connection drop, a 4xx answer) is
tried once more after a short pause. Logs never carry the password, the
recipient, the subject or the body (a code email carries the code).
``smtplib`` is synchronous, so the send runs in a worker thread.
"""

import asyncio
import smtplib
import socket
import ssl
from email.message import EmailMessage

import structlog

from app.core.config import get_settings

log = structlog.get_logger()

SEND_TIMEOUT_SECONDS = 8
RETRY_PAUSE_SECONDS = 2.0


class EmailSendError(Exception):
    """A send that did not go out: ``reason`` in plain words, ``hint`` says what to check."""

    def __init__(self, reason: str, hint: str, *, temporary: bool) -> None:
        super().__init__(reason)
        self.reason = reason
        self.hint = hint
        self.temporary = temporary


def email_mode() -> dict[str, object]:
    """What sending does right now: {"mode": "smtp", "host", "port"} or
    {"mode": "console", "reason"}. Never the username or the password."""
    s = get_settings()
    if not s.email_host:
        return {"mode": "console", "reason": "EMAIL_HOST is not set"}
    if not s.email_password:
        return {"mode": "console", "reason": "EMAIL_PASSWORD is not set"}
    if s.is_dev and not s.email_send_in_dev:
        return {
            "mode": "console",
            "reason": "development (set EMAIL_SEND_IN_DEV=1 to send for real)",
        }
    return {"mode": "smtp", "host": s.email_host, "port": s.email_port}


def log_email_mode() -> None:
    """The start-up line: real SMTP or console only, and why."""
    log.info("email_mode", **email_mode())


def _classify(exc: BaseException) -> EmailSendError:
    if isinstance(exc, EmailSendError):
        return exc
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return EmailSendError(
            f"login refused ({exc.smtp_code})",
            "Check EMAIL_USERNAME and EMAIL_PASSWORD (Gmail needs an app password).",
            temporary=False,
        )
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return EmailSendError(
            f"sender refused ({exc.smtp_code})",
            "EMAIL_FROM must be an address this account is allowed to send as.",
            temporary=False,
        )
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return EmailSendError(
            "recipient refused", "The address was refused by the mail server.", temporary=False
        )
    if isinstance(exc, ssl.SSLError | smtplib.SMTPNotSupportedError):
        return EmailSendError(
            "TLS failed",
            "Use port 587 (STARTTLS) or 465 (SSL) as the provider says.",
            temporary=False,
        )
    if isinstance(exc, TimeoutError | socket.timeout | ConnectionError | socket.gaierror):
        return EmailSendError(
            "cannot connect or timed out",
            "Check EMAIL_HOST, EMAIL_PORT and that this machine can reach the server.",
            temporary=True,
        )
    if isinstance(exc, smtplib.SMTPResponseException) and 400 <= exc.smtp_code < 500:
        return EmailSendError(
            f"temporary failure ({exc.smtp_code})", "The server asked to try later.", temporary=True
        )
    if isinstance(exc, smtplib.SMTPServerDisconnected | OSError):
        return EmailSendError(
            "connection dropped", "The server closed the connection; try again.", temporary=True
        )
    return EmailSendError(type(exc).__name__, "Unexpected mail error.", temporary=False)


def _send_sync(
    host: str, port: int, username: str | None, password: str, msg: EmailMessage, timeout: float
) -> None:
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=timeout) as client:
                if username:
                    client.login(username, password)
                client.send_message(msg)
            return
        with smtplib.SMTP(host, port, timeout=timeout) as client:
            client.starttls()
            if username:
                client.login(username, password)
            client.send_message(msg)
    except Exception as exc:  # noqa: BLE001 - every failure is named for the caller
        raise _classify(exc) from exc


def _message(to: str, subject: str, body: str, html: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = get_settings().email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html is not None:
        msg.add_alternative(html, subtype="html")
    return msg


async def send_email(
    to: str,
    subject: str,
    body: str,
    html: str | None = None,
    *,
    timeout: float = SEND_TIMEOUT_SECONDS,
    kind: str = "email",
) -> bool:
    """Send an email (plain text, plus an HTML alternative when given). Returns True when it
    went out over SMTP, False in console mode. Raises ``EmailSendError`` when it could not
    be sent, after one retry if the failure looked temporary; each failure is logged with
    its reason and hint (never the address, subject or body)."""
    mode = email_mode()
    if mode["mode"] != "smtp":
        log.info("email_dev_delivery", kind=kind, html=html is not None)
        return False
    s = get_settings()
    msg = _message(to, subject, body, html)
    for attempt in (1, 2):
        try:
            await asyncio.to_thread(
                _send_sync,
                s.email_host or "",
                s.email_port,
                s.email_username,
                s.email_password or "",
                msg,
                timeout,
            )
            log.info("email_sent", kind=kind, attempt=attempt)
            return True
        except EmailSendError as err:
            log.warning(
                "email_send_failed", kind=kind, attempt=attempt, reason=err.reason, hint=err.hint
            )
            if attempt == 1 and err.temporary:
                await asyncio.sleep(RETRY_PAUSE_SECONDS)
                continue
            raise
    return False  # not reached
