"""Redis distributed lock for the booking engine (docs/11_BOOKING_ENGINE.md
section 3): prevents two players from booking the same court/date/slot at
once. ``SET key token NX PX 30000`` — atomic acquire, 30s auto-expiry so a
crashed request can never deadlock a slot.

Release is check-then-delete rather than a bare ``DEL``: if the lock already
expired and a different transaction acquired it, a stale holder's release
must not evict that newer holder's lock. This isn't fully atomic (no Lua —
fakeredis has no scripting support without the optional ``lupa`` dependency,
and pulling one in just for a test double isn't worth it here); the race
window is a few milliseconds between GET and DEL, and the 30s TTL makes a
lost delete self-healing, which is a fine trade-off at this project's scale.
"""

import uuid
from datetime import date, time

import structlog

from app.cache import redis as redis_cache

logger = structlog.get_logger(__name__)

LOCK_TTL_MS = 30_000


def slot_lock_key(court_id: uuid.UUID, booking_date: date, start_time: time) -> str:
    slot_start = start_time.isoformat(timespec="minutes")
    return f"lock:court:{court_id}:date:{booking_date.isoformat()}:slot:{slot_start}"


async def acquire_slot_lock(
    court_id: uuid.UUID, booking_date: date, start_time: time
) -> tuple[bool, str, str]:
    """Try to acquire the lock for one court/date/slot.

    Returns ``(acquired, lock_key, token)``. ``token`` identifies this holder
    so ``release_slot_lock`` only deletes a lock this call actually owns.
    """
    key = slot_lock_key(court_id, booking_date, start_time)
    token = uuid.uuid4().hex
    acquired = bool(await redis_cache.get_redis().set(key, token, nx=True, px=LOCK_TTL_MS))
    if acquired:
        logger.info("slot_lock.acquired", lock_key=key)
    else:
        logger.info("slot_lock.conflict", lock_key=key)
    return acquired, key, token


async def release_slot_lock(lock_key: str, token: str) -> None:
    redis = redis_cache.get_redis()
    current = await redis.get(lock_key)
    if current == token:
        await redis.delete(lock_key)
        logger.info("slot_lock.released", lock_key=lock_key)
    else:
        logger.info("slot_lock.release_skipped", lock_key=lock_key)
