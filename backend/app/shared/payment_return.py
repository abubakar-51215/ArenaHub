"""Sending the player back to the app after an outside payment page (card).

Stripe's card page only accepts web addresses for "after paying", so it is given
``{API_PUBLIC_URL}/api/v1/payments/return?to=<app address>`` and that route forwards to the app.
Only app addresses are forwarded (never an arbitrary site), so the route cannot be used to send
people elsewhere.
"""

from urllib.parse import quote

from app.core.config import get_settings

# the phone app's own link scheme; Expo Go and the web build in development
_ALWAYS = ("arenahub://",)
_DEV_ONLY = ("exp://", "exps://", "http://localhost:", "http://127.0.0.1:")
DEFAULT_RETURN = "arenahub://booking/return"


def is_allowed(to: str) -> bool:
    if not to or len(to) > 500 or any(c in to for c in "\r\n\\"):
        return False
    settings = get_settings()
    allowed = list(_ALWAYS)
    web = settings.web_public_url.rstrip("/")
    if web.startswith("https://"):
        allowed.append(web + "/")
    if settings.is_dev:
        allowed.extend(_DEV_ONLY)
    return to.startswith(tuple(allowed))


def bounce(to: str | None) -> str:
    """The web address that forwards to ``to`` (or to the app's default return screen)."""
    target = to if to and is_allowed(to) else DEFAULT_RETURN
    base = get_settings().api_public_url.rstrip("/")
    return f"{base}/api/v1/payments/return?to={quote(target, safe='')}"
