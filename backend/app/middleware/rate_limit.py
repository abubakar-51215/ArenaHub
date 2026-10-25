"""Redis fixed-window rate limiter, stricter on auth endpoints (Sprint 2).

Per-client-IP counters live in Redis with a rolling window TTL. Auth routes
(login/register/OTP/reset) get a tighter budget to blunt brute-force and OTP
guessing; other ``/api/v1`` routes get a looser one. Health checks, docs, and
CORS preflights are exempt.

If Redis is unreachable the API stays up and the limit is counted in this
process's memory instead (same budget), so login and OTP guessing stay bounded while
the cache is down (risk register — graceful fallback). Those counters are per server
process: N workers allow up to N times the budget, and a restart clears them. The table
holds at most 10,000 addresses; when it is full of live windows a new address is refused
(fail closed) rather than an old counter being dropped.
"""

import time
from ipaddress import IPv4Address, IPv6Address, ip_address

from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.cache import redis as redis_cache
from app.core.config import get_settings
from app.core.outage_log import OutageLog
from app.shared.response import error

WINDOW_SECONDS = 60

_AUTH_PREFIX = "/api/v1/auth"
_API_PREFIX = "/api/v1"
_EXEMPT_PATHS = frozenset({"/api/v1/health"})

# Fallback counters used only while Redis is unreachable: key -> (window start, count).
# Per server process: they are not shared between workers and are lost on restart.
_FALLBACK_MAX_KEYS = 10_000
_fallback_counts: dict[str, tuple[float, int]] = {}
_outage = OutageLog("rate_limit")


def _prune_expired(now: float) -> None:
    for k in [k for k, (start, _) in _fallback_counts.items() if now - start >= WINDOW_SECONDS]:
        del _fallback_counts[k]


def _fallback_hit(key: str, limit: int, now: float | None = None) -> tuple[int, int]:
    """Count one request in memory; return (count in this window, seconds left).

    Bounded: if the table is full of live windows and this address is not in it, the
    request is refused (count above the limit) instead of an old entry being dropped,
    because dropping entries would let a flood of new addresses reset other counters.
    """
    now = time.monotonic() if now is None else now
    if key not in _fallback_counts and len(_fallback_counts) >= _FALLBACK_MAX_KEYS:
        _prune_expired(now)
        if len(_fallback_counts) >= _FALLBACK_MAX_KEYS:
            oldest = min(start for start, _ in _fallback_counts.values())
            return limit + 1, max(int(WINDOW_SECONDS - (now - oldest)), 1)
    start, count = _fallback_counts.get(key, (now, 0))
    if now - start >= WINDOW_SECONDS:
        start, count = now, 0
    _fallback_counts[key] = (start, count + 1)
    return count + 1, max(int(WINDOW_SECONDS - (now - start)), 1)


async def _seconds_left(client: Redis, key: str, first: bool = False) -> int:
    """Seconds until the Redis counter resets, setting its expiry when it has none.

    Never raises: the count is already known, so a failing expire/ttl only costs the
    exact Retry-After hint. A counter left without an expiry is repaired on the next
    request that sees it (ttl below zero), so an address is never blocked forever.
    """
    try:
        if first:
            await client.expire(key, WINDOW_SECONDS)
            return WINDOW_SECONDS
        ttl = int(await client.ttl(key))
        if ttl < 0:
            await client.expire(key, WINDOW_SECONDS)
            return WINDOW_SECONDS
        return ttl
    except Exception:  # noqa: BLE001
        return WINDOW_SECONDS


def _parse_ip(value: str) -> IPv4Address | IPv6Address | None:
    try:
        return ip_address(value.strip())
    except ValueError:
        return None


def _client_ip(request: Request) -> str:
    """The address the limit is counted against.

    The connection address, unless the connection comes from a trusted proxy
    (``TRUSTED_PROXIES``). Then X-Forwarded-For is read from the right, skipping
    the trusted proxies' own hops: the first address that is not a trusted proxy
    is the client. Anything to the left of it was written by the client and is
    not believed. A malformed entry stops the walk and the last trusted hop is
    used, so a bad header can neither crash the limiter nor pick a fresh bucket.
    """
    peer = request.client.host if request.client else "unknown"
    trusted = get_settings().trusted_proxy_networks
    peer_ip = _parse_ip(peer)
    if not trusted or peer_ip is None or not any(peer_ip in net for net in trusted):
        return peer
    hops = [h for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    client = peer
    for hop in reversed(hops):
        hop_ip = _parse_ip(hop)
        if hop_ip is None:
            break
        client = str(hop_ip)
        if not any(hop_ip in net for net in trusted):
            break
    return client


def _limit_for(path: str) -> int | None:
    """Return the request budget for a path, or None if it isn't rate-limited."""
    if request_is_exempt(path):
        return None
    settings = get_settings()
    if path.startswith(_AUTH_PREFIX):
        return settings.rate_limit_auth_per_minute
    if path.startswith(_API_PREFIX):
        return settings.rate_limit_api_per_minute
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
        except Exception as exc:  # noqa: BLE001 — count in memory on any cache error.
            _outage.failed(exc)
            count, ttl = _fallback_hit(key, limit)
        else:
            _outage.ok()
            # incr worked, so the count is known: a failing expire or ttl must not
            # throw it away (that would reset an over-limit address to one).
            if count == 1 or count > limit:
                ttl = await _seconds_left(client, key, first=count == 1)
            else:
                ttl = WINDOW_SECONDS  # not needed: the request is allowed

        if count > limit:
            return JSONResponse(
                status_code=429,
                content=error("Too many requests. Please slow down."),
                headers={"Retry-After": str(max(ttl, 1))},
            )
        return await call_next(request)
