"""Redis-backed refresh-token rotation, replay detection, and session state.

Deviation #17: every refresh use rotates to a new token and marks the old one
used; presenting an already-used token is a replay and revokes the whole token
*family* (forcing re-login). We also keep a short access-token denylist (for
logout) and a per-user session epoch (bumped on password change/reset so all
older tokens stop validating).

Keys — all namespaced under ``auth:`` with a TTL so nothing lingers forever:
- ``auth:rt:used:{jti}``       a rotated (spent) refresh token id
- ``auth:rt:revoked:{family}`` a revoked refresh-token family
- ``auth:at:denied:{jti}``     an access token invalidated by logout
- ``auth:epoch:{user_id}``     unix ts; tokens issued before it are stale
"""

from datetime import UTC, datetime

from app.cache import redis as redis_cache
from app.core.security import ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL

_REFRESH_TTL_S = int(REFRESH_TOKEN_TTL.total_seconds())
_ACCESS_TTL_S = int(ACCESS_TOKEN_TTL.total_seconds())


# --- Refresh rotation / replay ----------------------------------------------


async def mark_refresh_used(jti: str) -> None:
    await redis_cache.get_redis().set(f"auth:rt:used:{jti}", "1", ex=_REFRESH_TTL_S)


async def is_refresh_used(jti: str) -> bool:
    return bool(await redis_cache.get_redis().exists(f"auth:rt:used:{jti}"))


async def try_mark_refresh_used(jti: str) -> bool:
    """Atomic check-and-set (single Redis round trip via SET NX) — returns
    True the first time a given jti is marked, False on every call after.
    Using this instead of a separate is_refresh_used + mark_refresh_used pair
    closes the race where two concurrent requests presenting the same
    not-yet-rotated token both pass the (non-atomic) check before either
    marks it used, defeating single-use rotation."""
    result = await redis_cache.get_redis().set(
        f"auth:rt:used:{jti}", "1", ex=_REFRESH_TTL_S, nx=True
    )
    return bool(result)


async def revoke_family(family: str) -> None:
    await redis_cache.get_redis().set(f"auth:rt:revoked:{family}", "1", ex=_REFRESH_TTL_S)


async def is_family_revoked(family: str) -> bool:
    return bool(await redis_cache.get_redis().exists(f"auth:rt:revoked:{family}"))


# --- Access denylist (logout) -----------------------------------------------


async def deny_access(jti: str) -> None:
    await redis_cache.get_redis().set(f"auth:at:denied:{jti}", "1", ex=_ACCESS_TTL_S)


async def is_access_denied(jti: str) -> bool:
    return bool(await redis_cache.get_redis().exists(f"auth:at:denied:{jti}"))


# --- Session epoch (password change/reset invalidates older sessions) --------


async def bump_session_epoch(user_id: str) -> None:
    now = int(datetime.now(UTC).timestamp())
    await redis_cache.get_redis().set(f"auth:epoch:{user_id}", str(now), ex=_REFRESH_TTL_S)


async def get_session_epoch(user_id: str) -> int:
    value = await redis_cache.get_redis().get(f"auth:epoch:{user_id}")
    return int(value) if value else 0
