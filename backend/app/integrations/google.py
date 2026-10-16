"""Continue with Google: check a Google ID token with Google's own library.

Only what Google signed is used: the account id (``sub``), the email (only when Google says it is
verified) and the name. The audience must be one of ``GOOGLE_CLIENT_IDS``; with none set, Google
sign-in is off. The token's signature, issuer and expiry are checked by ``google.oauth2.id_token``
against Google's published keys (fetched over the network, 8 s limit, run off the event loop)."""

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import get_settings

log = structlog.get_logger()

_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
_TIMEOUT_S = 8


class GoogleNotConfiguredError(Exception):
    """No client id is set: Google sign-in is not available."""


class GoogleTokenError(Exception):
    """The token is not a valid Google ID token for this app (the reason is logged, not shown)."""


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str


class _Request(google_requests.Request):
    """Google's request transport with an 8 s limit."""

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        kwargs["timeout"] = _TIMEOUT_S
        return super().__call__(*args, **kwargs)


def _verify_sync(token: str, audiences: list[str]) -> dict:
    return google_id_token.verify_oauth2_token(token, _Request(), audience=audiences)


async def verify_id_token(token: str) -> GoogleIdentity:
    audiences = get_settings().google_client_ids
    if not audiences:
        raise GoogleNotConfiguredError
    try:
        claims = await asyncio.to_thread(_verify_sync, token, audiences)
    except (ValueError, google_exceptions.GoogleAuthError) as exc:
        # wrong audience, expired, bad signature, not a JWT, keys could not be fetched ...
        log.info("google_token_refused", reason=type(exc).__name__)
        raise GoogleTokenError from exc
    if claims.get("iss") not in _ISSUERS:
        log.info("google_token_refused", reason="issuer")
        raise GoogleTokenError
    if claims.get("email_verified") is not True or not claims.get("email") or not claims.get("sub"):
        log.info("google_token_refused", reason="email not verified")
        raise GoogleTokenError
    email = str(claims["email"]).strip().lower()
    name = str(claims.get("name") or "").strip() or email.split("@")[0]
    return GoogleIdentity(sub=str(claims["sub"]), email=email, name=name[:255])
