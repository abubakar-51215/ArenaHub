"""Redis-backed access-token state: the logout denylist and the per-user session epoch.

Refresh tokens are NOT here any more: they are random strings stored as a hash in the database
(app/modules/auth/sessions.py). What stays in Redis is short-lived: an access token invalidated by
logout, and a per-user session epoch (bumped on password change/reset, suspension and "log out
everywhere") so all older access tokens stop validating at once.

Keys, all namespaced under ``auth:`` with a TTL so nothing lingers forever:
- ``auth:at:denied:{jti}``     an access token invalidated by logout
- ``auth:epoch_ms:{user_id}``  unix ms; tokens issued at or before it are stale
- ``auth:epoch:{user_id}``     older key, unix seconds; still honoured
"""

from datetime import UTC, datetime

from app.cache import redis as redis_cache
from app.core.security import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL

_REFRESH_TTL_S = int(REFRESH_TOKEN_TTL.total_seconds())
_ACCESS_TTL_S = int(ACCESS_TOKEN_TTL.total_seconds())


# --- Access denylist (logout) -----------------------------------------------


async def deny_access(jti: str) -> None:
    await redis_cache.get_redis().set(f"auth:at:denied:{jti}", "1", ex=_ACCESS_TTL_S)


async def is_access_denied(jti: str) -> bool:
    return bool(await redis_cache.get_redis().exists(f"auth:at:denied:{jti}"))


# --- Session epoch (password change/reset invalidates older sessions) --------


async def bump_session_epoch(user_id: str) -> None:
    now_ms = int(datetime.now(UTC).timestamp() * 1000)
    await redis_cache.get_redis().set(f"auth:epoch_ms:{user_id}", str(now_ms), ex=_REFRESH_TTL_S)


async def get_session_epoch_ms(user_id: str) -> int:
    redis = redis_cache.get_redis()
    value = await redis.get(f"auth:epoch_ms:{user_id}")
    if value:
        return int(value)
    # Epoch written before millisecond precision existed: whole seconds. Treat
    # it as the end of that second so nothing issued in it survives.
    legacy = await redis.get(f"auth:epoch:{user_id}")
    return int(legacy) * 1000 + 999 if legacy else 0


async def is_session_stale(user_id: str, payload: dict) -> bool:
    """True when the token was issued at or before the user's last password
    change/reset, i.e. it must no longer be accepted. A token without ``iat_ms``
    (minted before that claim existed) falls back to its whole-second ``iat``."""
    epoch_ms = await get_session_epoch_ms(user_id)
    if not epoch_ms:
        return False
    issued_ms = int(payload.get("iat_ms") or int(payload.get("iat", 0)) * 1000)
    return issued_ms <= epoch_ms
