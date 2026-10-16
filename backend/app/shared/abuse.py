"""Extra per-person limits on actions that cost something (OWASP API4 / API6).

These sit on top of the per-address limits in middleware/rate_limit.py, which are not changed.
Each limit counts one person's calls to one action in a window; people who are not signed in are
counted by address. The answer is the same 429 text the address limit already uses.
"""

import hashlib
from collections.abc import Awaitable, Callable

import structlog
from fastapi import Depends, Request

from app.cache import redis as redis_cache
from app.core.exceptions import TooManyRequestsError
from app.middleware.rate_limit import _client_ip
from app.modules.user.model import User
from app.shared.auth import get_current_user

log = structlog.get_logger()
MESSAGE = "Too many requests. Please slow down."


async def _hit(name: str, who: str, limit: int, window: int) -> None:
    key = f"abuse:{name}:{hashlib.sha256(who.encode()).hexdigest()[:24]}"
    try:
        redis = redis_cache.get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window)
    except Exception as exc:  # noqa: BLE001 - fail open like the address limiter
        log.warning("abuse_limit_unavailable", error=str(exc))
        return
    if count > limit:
        raise TooManyRequestsError(MESSAGE)


async def allow(name: str, who: str, limit: int, window_seconds: int) -> bool:
    """Count one hit and report whether it is within ``limit`` for the window.

    Unlike ``_hit`` this never raises — callers that want to *skip* (not reject) an
    action when over the limit use this. Fails open (returns True) if Redis is down.
    """
    key = f"abuse:{name}:{hashlib.sha256(who.encode()).hexdigest()[:24]}"
    try:
        redis = redis_cache.get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window_seconds)
    except Exception as exc:  # noqa: BLE001 - fail open like the address limiter
        log.warning("abuse_limit_unavailable", error=str(exc))
        return True
    return count <= limit


def per_user(name: str, limit: int, window_seconds: int) -> Callable[..., Awaitable[None]]:
    async def dependency(user: User = Depends(get_current_user)) -> None:
        await _hit(name, str(user.id), limit, window_seconds)

    return dependency


def per_address(name: str, limit: int, window_seconds: int) -> Callable[..., Awaitable[None]]:
    async def dependency(request: Request) -> None:
        await _hit(name, _client_ip(request), limit, window_seconds)

    return dependency
