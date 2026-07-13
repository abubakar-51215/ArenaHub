"""Cryptographic primitives and JWT issuance for authentication.

Pure functions only — no DB, no Redis. Password hashing (bcrypt), password
strength validation, and JWT access/refresh creation + decoding live here so
services stay storage- and transport-agnostic. The Redis-backed refresh
rotation / replay detection (deviation #17) lives in ``modules/auth/tokens.py``;
this module only mints and verifies the tokens themselves.

Token lifetimes follow FR-P-02: access 15 min, refresh 7 days.
"""

import re
import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError, ValidationError

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=7)

# bcrypt only hashes the first 72 bytes; reject longer input rather than
# silently truncate it (which would make distinct passwords collide).
_BCRYPT_MAX_BYTES = 72
_PASSWORD_MIN_LEN = 8
_SPECIAL_CHARS = re.compile(r"[^A-Za-z0-9]")


class TokenType(StrEnum):
    access = "access"
    refresh = "refresh"


# --- Passwords ---------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a plaintext password with a per-call bcrypt salt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time check of a plaintext password against a stored hash."""
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        # Malformed hash in storage — treat as a non-match, never raise.
        return False


def validate_password_strength(password: str) -> None:
    """Enforce FR-P-01: >=8 chars, one uppercase, one number, one special.

    Raises ValidationError with a user-facing message on the first failure.
    """
    if len(password.encode()) > _BCRYPT_MAX_BYTES:
        raise ValidationError("Password must be at most 72 bytes long.")
    if len(password) < _PASSWORD_MIN_LEN:
        raise ValidationError("Password must be at least 8 characters long.")
    if not any(c.isupper() for c in password):
        raise ValidationError("Password must contain at least one uppercase letter.")
    if not any(c.isdigit() for c in password):
        raise ValidationError("Password must contain at least one number.")
    if not _SPECIAL_CHARS.search(password):
        raise ValidationError("Password must contain at least one special character.")


# --- JWT ---------------------------------------------------------------------


def _base_claims(subject: uuid.UUID, token_type: TokenType, ttl: timedelta) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sub": str(subject),
        "type": token_type.value,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    """Mint a short-lived access token carrying the user's role for RBAC."""
    settings = get_settings()
    claims = _base_claims(user_id, TokenType.access, ACCESS_TOKEN_TTL)
    claims["role"] = role
    return jwt.encode(claims, settings.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: uuid.UUID, family: str | None = None) -> str:
    """Mint a refresh token. ``family`` ties rotated tokens together so a
    replayed (already-used) token can revoke the whole lineage."""
    settings = get_settings()
    claims = _base_claims(user_id, TokenType.refresh, REFRESH_TOKEN_TTL)
    claims["family"] = family or uuid.uuid4().hex
    return jwt.encode(claims, settings.jwt_refresh_secret, algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    """Decode + verify a token, asserting its ``type`` claim.

    Raises UnauthorizedError on any signature/expiry/type mismatch so callers
    map every failure to a single 401.
    """
    settings = get_settings()
    is_access = expected_type is TokenType.access
    secret = settings.jwt_secret if is_access else settings.jwt_refresh_secret
    try:
        payload: dict[str, Any] = jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid authentication token.") from exc

    if payload.get("type") != expected_type.value:
        raise UnauthorizedError("Invalid authentication token.")
    return payload
