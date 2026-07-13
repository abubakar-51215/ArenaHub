"""Shared authentication dependencies.

Built once by Track A in Sprint 2 and imported by every protected route (the
integration contract in MASTER_DEVELOPMENT_PLAN.md). ``get_current_user``
resolves + validates a Bearer access token into a ``User``; ``require_role``
wraps it with an RBAC check that returns 403 on a role mismatch (doc 05).
"""

import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import TokenType, decode_token
from app.database.session import get_db
from app.modules.auth import tokens
from app.modules.user.model import User, UserRole

# auto_error=False so a missing/blank header maps to our 401 envelope rather
# than FastAPI's default 403.
_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Authentication required.")

    payload = decode_token(credentials.credentials, TokenType.access)
    jti = payload.get("jti", "")
    if jti and await tokens.is_access_denied(jti):
        raise UnauthorizedError("Token has been revoked.")

    user_id = payload["sub"]
    if int(payload.get("iat", 0)) < await tokens.get_session_epoch(user_id):
        raise UnauthorizedError("Session expired, please log in again.")

    user = await db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("Account is not active.")
    return user


def require_role(*roles: UserRole | str):  # type: ignore[no-untyped-def]
    """Dependency factory: allow only the listed roles, else 403.

    Usage: ``user = Depends(require_role("owner"))``.
    """

    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise ForbiddenError()
        return user

    return _guard
