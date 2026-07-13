"""Shared async Redis client for any local Redis-compatible service.

`from_url` connects lazily, so importing this never fails on a missing Redis.
Used for distributed locking and caching from Sprint 3.

protocol=2 (RESP2) is pinned so we work with older Redis servers (e.g. the
Redis 5.x Windows port) that don't implement the RESP3 `HELLO` handshake.
RESP2 covers everything we use; RESP3 push semantics aren't needed. Memurai
and modern Redis also speak RESP2, so this stays portable (see ADR-005).
"""

import redis.asyncio as redis

from app.core.config import get_settings

settings = get_settings()

redis_client: redis.Redis = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    protocol=2,
)


def get_redis() -> redis.Redis:
    """Return the shared Redis client.

    Indirection (rather than importing ``redis_client`` directly) lets tests
    swap in a fake by patching this function — call it as
    ``redis_cache.get_redis()`` so the lookup happens at call time.
    """
    return redis_client
