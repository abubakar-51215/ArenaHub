"""Error tracking (Sentry), off unless ``SENTRY_DSN`` is set.

When the DSN is empty, ``init_sentry()`` does nothing — no SDK init, no network
call, no crash. When it is set, every event is scrubbed of personal data before
it leaves the process (``scrub_event``):

* the request body, headers, cookies and query string are dropped whole,
* the user is reduced to an anonymous id (no email, no IP, no name),
* emails, phone numbers, tokens and receipt/signed links are redacted anywhere
  they still appear (message, exception values, breadcrumbs, extra, tags).

``scrub_event`` is a plain function so the tests can prove the removal without a
real Sentry client or any network.
"""

import re
from typing import Any, cast

import structlog

from app.core.config import get_settings

log = structlog.get_logger()

REDACTED = "[redacted]"

# Emails, Pakistani phone numbers (03xx-xxxxxxx / +92xxxxxxxxxx), bearer tokens and
# JWTs, and receipt links (both the signed media route and the stored /uploads path).
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?:\+?92|0)\d{9,10}\b")
_TOKEN = re.compile(r"(?i)(?:bearer\s+[A-Za-z0-9._\-]+|eyJ[A-Za-z0-9._\-]{8,})")
_RECEIPT = re.compile(r"/(?:api/v1/media|uploads)/receipts/[^\s\"'<>]*")
# The `request` interface's own query_string is dropped wholesale below, but the Sentry SDK
# also auto-captures breadcrumbs for outgoing fetch/XHR calls (the browser or phone app's own
# near-me request to the API) with the full URL as free text — this catches the lat/lon/radius
# there too.
_LOCATION_QUERY_PARAM = re.compile(r"(?i)\b(lat|lon|latitude|longitude|radius_km)=[^&\s\"'<>]*")

# Parts of a Sentry request interface we never keep anything from.
_DROP_REQUEST_KEYS = ("data", "headers", "cookies", "query_string", "env")
# Keys whose value is a secret regardless of its text (defensive, case-insensitive match).
_SECRET_KEYS = re.compile(
    r"(?i)(password|token|secret|authorization|cookie|api[_-]?key|otp|code|session)"
)


def redact_text(text: str) -> str:
    """Redact emails, phone numbers, tokens, receipt links and location query params inside a
    string."""
    for pattern in (_EMAIL, _PHONE, _TOKEN, _RECEIPT):
        text = pattern.sub(REDACTED, text)
    return _LOCATION_QUERY_PARAM.sub(r"\1=[redacted]", text)


def _scrub(value: Any, *, key: str | None = None) -> Any:
    if key is not None and _SECRET_KEYS.search(key):
        return REDACTED
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        return {k: _scrub(v, key=str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_scrub(v) for v in value]
    return value


def scrub_event(event: dict, _hint: dict | None = None) -> dict:
    """Remove personal data from a Sentry event before it is sent."""
    request = event.get("request")
    if isinstance(request, dict):
        for drop in _DROP_REQUEST_KEYS:
            request.pop(drop, None)

    user = event.get("user")
    if isinstance(user, dict):
        # keep only an anonymous id; drop email, ip_address, username, etc.
        event["user"] = {"id": str(user["id"])} if user.get("id") else {}

    for section in ("message", "logentry", "exception", "breadcrumbs", "extra", "contexts", "tags"):
        if section in event:
            event[section] = _scrub(event[section])
    return event


def init_sentry() -> bool:
    """Start Sentry when ``SENTRY_DSN`` is set; otherwise do nothing.

    Returns whether it started, so the start-up log can say so.
    """
    dsn = get_settings().sentry_dsn
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=dsn,
        environment=get_settings().environment.value,
        send_default_pii=False,  # never attach IP, cookies, or request bodies
        # the SDK types the hook against its Event TypedDict; our scrubber works on
        # the plain dict (same thing at runtime) so it stays easy to test.
        before_send=cast("Any", scrub_event),
        before_send_transaction=cast("Any", scrub_event),
        traces_sample_rate=0.0,  # errors only, no performance tracing by default
    )
    log.info("sentry_enabled", environment=get_settings().environment.value)
    return True
