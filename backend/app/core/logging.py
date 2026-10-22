"""structlog configuration — pretty console in dev, JSON in prod.

Configure once at startup via `configure_logging()`; every module then does
`import structlog` and `structlog.get_logger()` (docs/PROJECT_GUIDELINES.md
deviation #16).
"""

import contextlib
import logging
import re
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

from app.core.config import get_settings


def make_stream_safe(stream: object) -> None:
    """Never let a log line crash a request: a Windows console that is not UTF-8 cannot print the
    rupee sign in a notice, so characters it cannot write are replaced instead of raising."""
    reconfigure = getattr(stream, "reconfigure", None)
    if callable(reconfigure):
        with contextlib.suppress(ValueError, OSError):
            reconfigure(errors="replace")


_HIDE_CONTAINING = ("password", "secret", "token", "authorization", "cookie", "account", "iban")
_HIDE_EXACT = {"code", "otp", "pin", "cvv", "card"}
# A player's exact position. Hidden in every environment (not just outside dev, unlike the
# secrets below) — there is no "it's fine, it's only local dev" case for someone's coordinates.
_HIDE_LOCATION = {"lat", "lon", "latitude", "longitude", "radius_km", "near"}
HIDDEN = "[hidden]"


def redact_secrets(_: Any, __: str, event: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    """Last line of defence: whatever a log call is given, a value stored under a name that
    sounds like a secret never reaches the log. (The emailed code is shown in development
    only, where nothing is hidden, so a test never waits for an inbox. Location values are the
    one exception hidden in every environment — see ``_HIDE_LOCATION``.)"""
    for key in list(event):
        if key.lower() in _HIDE_LOCATION:
            event[key] = HIDDEN
    if get_settings().is_dev:
        return event
    for key in list(event):
        name = key.lower()
        if name in _HIDE_EXACT or any(word in name for word in _HIDE_CONTAINING):
            event[key] = HIDDEN
    return event


# Uvicorn's own access logger prints the raw request line (method, path, and query string)
# straight to stdout for every request — it never goes through structlog or redact_secrets
# above. A near-me search's lat/lon/radius_km would otherwise sit in that log in plain text.
_LOCATION_QUERY_PARAM = re.compile(r"(?i)\b(lat|lon|latitude|longitude|radius_km)=[^&\s\"]*")


class _RedactLocationFromAccessLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            record.args = tuple(
                _LOCATION_QUERY_PARAM.sub(r"\1=[hidden]", arg) if isinstance(arg, str) else arg
                for arg in record.args
            )
        return True


def configure_logging() -> None:
    settings = get_settings()
    make_stream_safe(sys.stdout)
    make_stream_safe(sys.stderr)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.log_level.upper(),
    )
    # Uvicorn configures "uvicorn.access" itself (before or after this call, depending on how
    # the process was started), but the logger object is a process-wide singleton either way —
    # adding the filter here reaches it regardless of ordering.
    logging.getLogger("uvicorn.access").addFilter(_RedactLocationFromAccessLog())

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        redact_secrets,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    renderer: structlog.typing.Processor = (
        structlog.dev.ConsoleRenderer() if settings.is_dev else structlog.processors.JSONRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(settings.log_level.upper())
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
