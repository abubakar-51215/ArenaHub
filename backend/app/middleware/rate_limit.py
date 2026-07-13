"""Redis fixed-window rate limiter, stricter on auth endpoints (Sprint 2).

Per-client-IP counters live in Redis with a rolling window TTL. Auth routes
(login/register/OTP/reset) get a tighter budget to blunt brute-force and OTP
guessing; other ``/api/v1`` routes get a looser one. Health checks, docs, and
CORS preflights are exempt.

Fails OPEN: if Redis is unreachable the request is allowed through rather than
taking the whole API down with the cache (risk register — graceful fallback).
"""

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.cache import redis as redis_cache
from app.shared.response import error

log = structlog.get_logger()

WINDOW_SECONDS = 60
DEFAULT_LIMIT = 100
AUTH_LIMIT = 20

_AUTH_PREFIX = "/api/v1/auth"
_API_PREFIX = "/api/v1"
_EXEMPT_PATHS = frozenset({"/api/v1/health"})


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _limit_for(path: str) -> int | None:
    """Return the request budget for a path, or None if it isn't rate-limited."""
    if request_is_exempt(path):
        return None
    if path.startswith(_AUTH_PREFIX):
        return AUTH_LIMIT
    if path.startswith(_API_PREFIX):
        return DEFAULT_LIMIT
    return None


def request_is_exempt(path: str) -> bool:
    return path in _EXEMPT_PATHS or not path.startswith(_API_PREFIX)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        limit = _limit_for(request.url.path)
        if limit is None or request.method == "OPTIONS":
            return await call_next(request)

        scope = "auth" if request.url.path.startswith(_AUTH_PREFIX) else "api"
        key = f"ratelimit:{scope}:{_client_ip(request)}"
        try:
            client = redis_cache.get_redis()
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, WINDOW_SECONDS)
        except Exception as exc:  # noqa: BLE001 — fail open on any cache error.
            log.warning("rate_limit_unavailable", error=str(exc))
            return await call_next(request)

        if count > limit:
            ttl = await client.ttl(key)
            return JSONResponse(
                status_code=429,
                content=error("Too many requests. Please slow down."),
                headers={"Retry-After": str(max(ttl, 1))},
            )
        return await call_next(request)
