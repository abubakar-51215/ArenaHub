"""Cryptographic primitives and JWT issuance for authentication.

Pure functions only — no DB, no Redis. Password hashing (Argon2id; older bcrypt hashes still
verify and are re-hashed at the next sign-in), password
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
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.common_passwords import is_common
from app.core.config import get_settings
from app.core.exceptions import UnauthorizedError, ValidationError
from app.core.messages import COMMON_PASSWORD

ALGORITHM = "HS256"
ACCESS_TOKEN_TTL = timedelta(minutes=15)
REFRESH_TOKEN_TTL = timedelta(days=7)
ADMIN_LOGIN_TOKEN_TTL = timedelta(minutes=10)

# Argon2id, the OWASP password-storage choice: memory 45 MiB (the minimum is 19 MiB), 2 passes,
# 1 lane.
# Measured on the development machine at about 150 to 180 ms a check (under the 250 ms limit); the
# settings are stored inside every hash, so they can be raised later and a hash made with older
# settings is replaced at the next sign-in (``password_needs_rehash``).
ARGON2_MEMORY_KIB = 46080
ARGON2_TIME_COST = 2
ARGON2_PARALLELISM = 1
_hasher = PasswordHasher(
    time_cost=ARGON2_TIME_COST,
    memory_cost=ARGON2_MEMORY_KIB,
    parallelism=ARGON2_PARALLELISM,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
_PASSWORD_MIN_LEN = 8
PASSWORD_MAX_LEN = 128
_SPECIAL_CHARS = re.compile(r"[^A-Za-z0-9]")


class TokenType(StrEnum):
    access = "access"
    refresh = "refresh"
    # carries an admin from the password step to the emailed-code step; it is
    # not an access or refresh token and is accepted nowhere else
    admin_login = "admin_login"


# --- Passwords ---------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash a password with Argon2id; the result is a PHC string with its own salt and settings."""
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check a password against a stored hash (Argon2id, or an older bcrypt hash).

    Never raises: a malformed or unknown hash is simply a non-match.
    """
    try:
        if password_hash.startswith("$argon2"):
            return bool(_hasher.verify(password_hash, password))
        if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(password.encode(), password_hash.encode())
    except (VerificationError, InvalidHashError, ValueError):
        return False
    return False


def password_needs_rehash(password_hash: str) -> bool:
    """True for a bcrypt hash, or an Argon2id hash made with weaker settings than today's."""
    if not password_hash.startswith("$argon2id$"):
        return True
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


_dummy_hash: str | None = None


def dummy_verify(password: str) -> None:
    """Spend the time of a real password check on an account that does not exist, so an unknown
    email or phone answers as slowly as a known one with a wrong password."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(uuid.uuid4().hex)
    verify_password(password, _dummy_hash)


def validate_password_strength(password: str) -> None:
    """Enforce FR-P-01 (8 to 128 characters, one uppercase, one number, one special) and refuse a
    very common password (app/core/common_passwords.py).

    Raises ValidationError with a user-facing message on the first failure.
    """
    if len(password) > PASSWORD_MAX_LEN:
        raise ValidationError(f"Password must be at most {PASSWORD_MAX_LEN} characters long.")
    if len(password) < _PASSWORD_MIN_LEN:
        raise ValidationError("Password must be at least 8 characters long.")
    if not any(c.isupper() for c in password):
        raise ValidationError("Password must contain at least one uppercase letter.")
    if not any(c.isdigit() for c in password):
        raise ValidationError("Password must contain at least one number.")
    if not _SPECIAL_CHARS.search(password):
        raise ValidationError("Password must contain at least one special character.")
    if is_common(password):
        raise ValidationError(COMMON_PASSWORD)


# --- JWT ---------------------------------------------------------------------


def _base_claims(subject: uuid.UUID, token_type: TokenType, ttl: timedelta) -> dict[str, Any]:
    now = datetime.now(UTC)
    return {
        "sub": str(subject),
        "type": token_type.value,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        # Milliseconds, for the session-epoch check: whole seconds cannot tell a
        # token minted just before a password reset from one minted just after.
        "iat_ms": int(now.timestamp() * 1000),
        "exp": int((now + ttl).timestamp()),
    }


def create_access_token(user_id: uuid.UUID, role: str) -> str:
    """Mint a short-lived access token carrying the user's role for RBAC."""
    settings = get_settings()
    claims = _base_claims(user_id, TokenType.access, ACCESS_TOKEN_TTL)
    claims["role"] = role
    return jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)


def create_refresh_token(user_id: uuid.UUID, family: str | None = None) -> str:
    """Mint a refresh token. ``family`` ties rotated tokens together so a
    replayed (already-used) token can revoke the whole lineage."""
    settings = get_settings()
    claims = _base_claims(user_id, TokenType.refresh, REFRESH_TOKEN_TTL)
    claims["family"] = family or uuid.uuid4().hex
    return jwt.encode(claims, settings.jwt_refresh_secret.get_secret_value(), algorithm=ALGORITHM)


def create_admin_login_token(user_id: uuid.UUID) -> str:
    """Mint the admin sign-in challenge: 10 minutes, for this user, for the
    code step only (its own ``type``)."""
    settings = get_settings()
    claims = _base_claims(user_id, TokenType.admin_login, ADMIN_LOGIN_TOKEN_TTL)
    return jwt.encode(claims, settings.jwt_refresh_secret.get_secret_value(), algorithm=ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    """Decode + verify a token, asserting its ``type`` claim.

    Raises UnauthorizedError on any signature/expiry/type mismatch so callers
    map every failure to a single 401.
    """
    settings = get_settings()
    is_access = expected_type is TokenType.access
    secret = (settings.jwt_secret if is_access else settings.jwt_refresh_secret).get_secret_value()
    try:
        payload: dict[str, Any] = jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise UnauthorizedError("Invalid authentication token.") from exc

    if payload.get("type") != expected_type.value:
        raise UnauthorizedError("Invalid authentication token.")
    return payload
