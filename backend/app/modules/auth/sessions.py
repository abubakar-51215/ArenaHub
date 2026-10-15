"""Refresh tokens kept on the server (Phase 3).

A refresh token is a random string (``secrets.token_urlsafe``). Only its SHA-256 hash is stored,
with the ``family_id`` of the sign-in it belongs to, so a stolen database cannot be used to refresh
anyone's session. Every use rotates it: the old token is marked used and a new one in the same
family is returned. Using a token that was already used means it was copied, so the whole family is
revoked and the person signs in again. A password change or reset, a suspension, and "log out
everywhere" revoke every token of the user.

Access tokens stay short (15 minutes) and are cut off at once by the session epoch (see tokens.py).
"""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedError
from app.core.security import REFRESH_TOKEN_TTL
from app.modules.auth.model import RefreshToken

REUSE_MESSAGE = "Refresh token reuse detected; session revoked."
REVOKED_MESSAGE = "Session revoked, please log in again."
INVALID_MESSAGE = "Invalid authentication token."


def _now() -> datetime:
    return datetime.now(UTC)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def issue(db: AsyncSession, user_id: uuid.UUID, family_id: uuid.UUID | None = None) -> str:
    """A new refresh token (the only time the raw value exists on the server); caller commits."""
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user_id,
            family_id=family_id or uuid.uuid4(),
            token_hash=hash_token(raw),
            expires_at=_now() + REFRESH_TOKEN_TTL,
        )
    )
    await db.flush()
    return raw


async def rotate(db: AsyncSession, raw: str) -> tuple[uuid.UUID, str]:
    """Use a refresh token once: returns (user id, the next token of the same family)."""
    row = await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)).with_for_update()
    )
    if row is None:
        raise UnauthorizedError(INVALID_MESSAGE)
    now = _now()
    if row.revoked_at is not None:
        raise UnauthorizedError(REVOKED_MESSAGE)
    if row.used_at is not None:
        # a token that was already used is being used again: someone holds a copy. End the family.
        await revoke_family(db, row.family_id)
        await db.commit()
        raise UnauthorizedError(REUSE_MESSAGE)
    if row.expires_at <= now:
        raise UnauthorizedError("Session expired, please log in again.")
    row.used_at = now
    nxt = await issue(db, row.user_id, row.family_id)
    return row.user_id, nxt


async def revoke_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


async def revoke_token_family(db: AsyncSession, raw: str) -> bool:
    """Log out one sign-in: revoke the family of this token (False when the token is unknown)."""
    family = await db.scalar(
        select(RefreshToken.family_id).where(RefreshToken.token_hash == hash_token(raw))
    )
    if family is None:
        return False
    await revoke_family(db, family)
    return True


async def revoke_all(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Every sign-in of this user ends (password change, reset, suspension, log out everywhere)."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


async def delete_expired(db: AsyncSession) -> int:
    """Tokens are removed a week after they ended (so reuse of a recent one is still detected)."""
    cutoff = _now() - REFRESH_TOKEN_TTL
    result = await db.execute(delete(RefreshToken).where(RefreshToken.expires_at < cutoff))
    return int(result.rowcount or 0)
