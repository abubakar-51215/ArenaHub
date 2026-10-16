"""A growing wait after repeated wrong passwords, on top of the per-address request limits.

Counted per typed identifier (the email or phone, however it is spelled), NOT per account, so an
address nobody owns behaves exactly like one somebody does: no way to tell them apart by being
locked out. From the 5th wrong try in a row the next try must wait 1 minute, then 2, 4, 8, and
15 minutes at most. There is no permanent lock: a right password (after the wait) clears it, and
an idle identifier forgets its failures after a day. Nothing is stored beyond a counter.

Redis is used like the rate limiter: if it is unreachable the guard lets the request through.
"""

import hashlib
import time

import structlog

from app.cache import redis as redis_cache
from app.core.exceptions import TooManyRequestsError
from app.core.messages import too_many_attempts
from app.shared.phone import phone_key

log = structlog.get_logger()

FREE_TRIES = 5  # wrong tries before the first wait
MAX_WAIT_MINUTES = 15
_FORGET_AFTER_S = 24 * 3600


def delay_seconds(failures: int) -> int:
    """The wait that follows this many wrong tries in a row (0 below the 5th)."""
    if failures < FREE_TRIES:
        return 0
    return min(2 ** (failures - FREE_TRIES), MAX_WAIT_MINUTES) * 60


def _key(identifier: str) -> str:
    who = identifier.strip().lower()
    if "@" not in who and not who.startswith("acct:"):
        who = phone_key(who)
    return "auth:lf:" + hashlib.sha256(who.encode()).hexdigest()[:32]


async def check(identifier: str) -> None:
    """Refuse a try while the wait after earlier wrong passwords is running."""
    try:
        until = await redis_cache.get_redis().get(_key(identifier) + ":until")
    except Exception:  # noqa: BLE001 - fail open, like the rate limiter
        log.warning("login_guard_unavailable")
        return
    if until:
        left = float(until) - time.time()
        if left > 0:
            raise TooManyRequestsError(too_many_attempts(left))


async def failed(identifier: str) -> int:
    """Count a wrong try; returns the number of wrong tries in a row."""
    try:
        redis = redis_cache.get_redis()
        key = _key(identifier)
        count = int(await redis.incr(key))
        await redis.expire(key, _FORGET_AFTER_S)
        wait = delay_seconds(count)
        if wait:
            await redis.set(key + ":until", str(time.time() + wait), ex=_FORGET_AFTER_S)
        return count
    except Exception:  # noqa: BLE001
        log.warning("login_guard_unavailable")
        return 0


async def succeeded(identifier: str) -> None:
    try:
        redis = redis_cache.get_redis()
        key = _key(identifier)
        await redis.delete(key, key + ":until")
    except Exception:  # noqa: BLE001
        log.warning("login_guard_unavailable")
