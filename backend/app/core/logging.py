"""structlog configuration — pretty console in dev, JSON in prod.

Configure once at startup via `configure_logging()`; every module then does
`import structlog` and `structlog.get_logger()` (docs/PROJECT_GUIDELINES.md
deviation #16).
"""

import contextlib
import logging
import sys

import structlog

from app.core.config import get_settings


def make_stream_safe(stream: object) -> None:
    """Never let a log line crash a request: a Windows console that is not UTF-8 cannot print the
    rupee sign in a notice, so characters it cannot write are replaced instead of raising."""
    reconfigure = getattr(stream, "reconfigure", None)
    if callable(reconfigure):
        with contextlib.suppress(ValueError, OSError):
            reconfigure(errors="replace")


def configure_logging() -> None:
    settings = get_settings()
    make_stream_safe(sys.stdout)
    make_stream_safe(sys.stderr)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.log_level.upper(),
    )

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
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
