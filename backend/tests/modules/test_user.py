"""User/profile + RBAC tests: auth-guarded profile, role enforcement, and
the last-3 password-reuse rule."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.modules.auth import repository as repo
from app.modules.user.model import User, UserRole
from app.shared.auth import require_role

PASSWORD = "StrongP@ss1"


async def _verified_tokens(client: AsyncClient, db: AsyncSession, email: str) -> dict:
    await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test User",
            "email": email,
            "phone": "03007770000",
            "password": PASSWORD,
            "role": "player",
        },
    )
    user = await repo.get_user_by_email(db, email)
    assert user is not None
    otp = await repo.get_latest_otp(db, user.id)
    assert otp is not None
    resp = await client.post("/api/v1/auth/verify-otp", json={"email": email, "code": otp.code})
    return resp.json()["data"]


def _auth_header(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_require_role_blocks_cross_role() -> None:
    guard = require_role("owner")
    player = User(role=UserRole.player)
    owner = User(role=UserRole.owner)

    with pytest.raises(ForbiddenError):
        await guard(user=player)
    assert await guard(user=owner) is owner


async def test_get_me_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401


async def test_get_and_update_profile(client: AsyncClient, db_session: AsyncSession) -> None:
    tokens = await _verified_tokens(client, db_session, "me@example.com")

    me = await client.get("/api/v1/users/me", headers=_auth_header(tokens))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "me@example.com"

    updated = await client.put(
        "/api/v1/users/me",
        headers=_auth_header(tokens),
        json={"bio": "I play cricket", "preferred_sports": ["cricket"]},
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["bio"] == "I play cricket"


async def test_change_password_rejects_reuse(client: AsyncClient, db_session: AsyncSession) -> None:
    tokens = await _verified_tokens(client, db_session, "reuse@example.com")

    resp = await client.put(
        "/api/v1/users/me/password",
        headers=_auth_header(tokens),
        json={"current_password": PASSWORD, "new_password": PASSWORD},
    )
    assert resp.status_code == 422
    assert "reuse" in resp.json()["message"].lower()
