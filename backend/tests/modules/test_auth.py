"""Auth flow tests (DB-backed): register→verify→login→refresh, account
lockout, and refresh-token replay detection (deviation #17)."""

from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo

PASSWORD = "StrongP@ss1"


async def _register(
    client: AsyncClient,
    *,
    email: str = "player1@example.com",
    phone: str = "03001234567",
    password: str = PASSWORD,
    role: str = "player",
) -> Any:
    return await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test Player",
            "email": email,
            "phone": phone,
            "password": password,
            "role": role,
        },
    )


async def _otp_code(db: AsyncSession, email: str) -> str:
    user = await repo.get_user_by_email(db, email)
    assert user is not None
    otp = await repo.get_latest_otp(db, user.id)
    assert otp is not None
    return otp.code


async def _register_and_verify(client: AsyncClient, db: AsyncSession, email: str) -> dict:
    await _register(client, email=email)
    code = await _otp_code(db, email)
    resp = await client.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def test_register_verify_login_refresh(client: AsyncClient, db_session: AsyncSession) -> None:
    email = "flow@example.com"
    # Register — account starts unverified, OTP issued.
    reg = await _register(client, email=email)
    assert reg.status_code == 201, reg.text
    assert reg.json()["data"]["user"]["is_verified"] is False

    # Unverified login is refused until the OTP is confirmed.
    early = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert early.status_code == 401

    # Verify OTP — activates account and returns a token pair.
    code = await _otp_code(db_session, email)
    verify = await client.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    assert verify.status_code == 200, verify.text
    assert verify.json()["data"]["access_token"]

    # Login with the verified credentials.
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    login_tokens = login.json()["data"]

    # Refresh rotates to a brand-new refresh token.
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login_tokens["refresh_token"]}
    )
    assert refresh.status_code == 200, refresh.text
    assert refresh.json()["data"]["refresh_token"] != login_tokens["refresh_token"]


async def test_login_locks_after_5_failures(client: AsyncClient, db_session: AsyncSession) -> None:
    email = "lockme@example.com"
    await _register_and_verify(client, db_session, email)

    for _ in range(5):
        bad = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "WrongP@ss9"}
        )
        assert bad.status_code == 401

    # 6th attempt — now locked even though the password is correct.
    locked = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert locked.status_code == 401
    assert "locked" in locked.json()["message"].lower()


async def test_refresh_replay_revokes_family(client: AsyncClient, db_session: AsyncSession) -> None:
    email = "replay@example.com"
    tokens = await _register_and_verify(client, db_session, email)
    original_refresh = tokens["refresh_token"]

    # First rotation succeeds and yields a new refresh token.
    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
    assert first.status_code == 200
    rotated_refresh = first.json()["data"]["refresh_token"]

    # Replaying the now-spent original token is detected → whole family revoked.
    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": original_refresh})
    assert replay.status_code == 401
    assert "reuse" in replay.json()["message"].lower()

    # The legitimately-rotated token is collateral damage — family is dead.
    after = await client.post("/api/v1/auth/refresh", json={"refresh_token": rotated_refresh})
    assert after.status_code == 401


async def test_register_duplicate_email_conflicts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register(client, email="dupe@example.com", phone="03009999999")
    again = await _register(client, email="dupe@example.com", phone="03008888888")
    assert again.status_code == 409


async def test_register_weak_password_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    resp = await _register(client, email="weak@example.com", password="weak")
    assert resp.status_code == 422


async def test_resend_otp_issues_fresh_code_and_retires_old(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register(client, email="resend1@example.com", phone="03007777771")
    user = await repo.get_user_by_email(db_session, "resend1@example.com")
    assert user is not None
    original = await repo.get_latest_otp(db_session, user.id)
    assert original is not None

    # Cooldown: an immediate resend right after registration is rejected.
    too_soon = await client.post("/api/v1/auth/resend-otp", json={"email": "resend1@example.com"})
    assert too_soon.status_code == 422
    assert "wait" in too_soon.json()["message"].lower()

    # Age the outstanding OTP past the cooldown, then resend for real.
    from app.modules.auth.service import OTP_RESEND_COOLDOWN

    original.expires_at = original.expires_at - OTP_RESEND_COOLDOWN * 2
    await db_session.commit()

    resent = await client.post("/api/v1/auth/resend-otp", json={"email": "resend1@example.com"})
    assert resent.status_code == 200

    fresh = await repo.get_latest_otp(db_session, user.id)
    assert fresh is not None
    assert fresh.id != original.id

    # The old (now retired) code no longer verifies; the fresh one does.
    old_attempt = await client.post(
        "/api/v1/auth/verify-otp", json={"email": "resend1@example.com", "code": original.code}
    )
    if fresh.code != original.code:  # 1-in-a-million collision guard
        assert old_attempt.status_code == 422
    verified = await client.post(
        "/api/v1/auth/verify-otp", json={"email": "resend1@example.com", "code": fresh.code}
    )
    assert verified.status_code == 200


async def test_resend_otp_does_not_leak_account_existence(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/resend-otp", json={"email": "ghost@example.com"})
    assert resp.status_code == 200
    assert "new code has been sent" in resp.json()["message"]
