"""Admin sign-in with an emailed code.

/auth/login gives an admin with the right password no tokens: it emails an
admin_login code and returns a 10-minute challenge token. The code and the
challenge go to /auth/admin/verify-code for the normal tokens. Owners and
players sign in exactly as before.
"""

import re
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, make_admin, make_user


async def _login(client: AsyncClient, email: str, password: str = PASSWORD):
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def _verify(client: AsyncClient, challenge: str, code: str):
    return await client.post(
        "/api/v1/auth/admin/verify-code", json={"challenge_token": challenge, "code": code}
    )


async def _admin_with_challenge(client: AsyncClient, db: AsyncSession, email: str):
    await make_admin(client, db, email)
    res = await _login(client, email)
    assert res.status_code == 200
    user = await repo.get_user_by_email(db, email)
    assert user is not None
    otp = await repo.get_latest_otp(db, user.id, OtpPurpose.admin_login)
    assert otp is not None
    return res.json()["data"], user, otp


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def test_admin_with_the_right_password_gets_no_tokens_and_a_code(client, db_session):
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-step@example.com")

    assert data["mfa_required"] is True
    assert data["challenge_token"] and data["expires_in"] == 600
    assert "access_token" not in data and "refresh_token" not in data
    assert len(otp.code) == 6 and otp.code.isdigit()


async def test_wrong_code_is_rejected(client, db_session):
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-wrong@example.com")

    res = await _verify(client, data["challenge_token"], _wrong(otp.code))

    assert res.status_code == 422
    assert "Invalid or expired" in res.json()["message"]


async def test_expired_code_is_rejected(client, db_session):
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-old@example.com")
    otp.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    res = await _verify(client, data["challenge_token"], otp.code)

    assert res.status_code == 422


async def test_right_code_returns_the_normal_tokens(client, db_session):
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-ok@example.com")

    res = await _verify(client, data["challenge_token"], otp.code)

    assert res.status_code == 200
    tokens = res.json()["data"]
    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200 and me.json()["data"]["role"] == "admin"
    # the code is used up
    assert (await _verify(client, data["challenge_token"], otp.code)).status_code == 422


async def test_five_wrong_codes_need_a_new_code(client, db_session):
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-five@example.com")
    for _ in range(5):
        await _verify(client, data["challenge_token"], _wrong(otp.code))

    res = await _verify(client, data["challenge_token"], otp.code)

    assert res.status_code == 422
    assert "Too many incorrect attempts" in res.json()["message"]


async def test_a_challenge_does_not_work_for_another_user_or_as_a_token(client, db_session):
    a, _, _ = await _admin_with_challenge(client, db_session, "adm-a@example.com")
    _, _, otp_b = await _admin_with_challenge(client, db_session, "adm-b@example.com")

    # A's challenge with B's code: checked against A's code, so refused
    assert (await _verify(client, a["challenge_token"], otp_b.code)).status_code == 422
    # a made-up value and a challenge used as an access token: plain 401s
    bad = await _verify(client, "not-a-token", otp_b.code)
    assert bad.status_code == 401 and "Sign in again" in bad.json()["message"]
    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {a['challenge_token']}"}
    )
    assert me.status_code == 401


async def _resend(client: AsyncClient, challenge: str):
    return await client.post("/api/v1/auth/admin/resend-code", json={"challenge_token": challenge})


async def _age_latest_code(db: AsyncSession, user, seconds: int) -> None:
    """Pretend the newest admin code was sent ``seconds`` earlier."""
    latest = await repo.get_latest_otp(db, user.id, OtpPurpose.admin_login)
    latest.expires_at -= timedelta(seconds=seconds)
    await db.commit()


async def test_resend_inside_60_seconds_says_how_long_to_wait(client, db_session):
    data, user, first = await _admin_with_challenge(client, db_session, "adm-resend@example.com")

    res = await _resend(client, data["challenge_token"])

    assert res.status_code == 429
    message = res.json()["message"]
    seconds = int(re.fullmatch(r"Wait (\d+) seconds before asking for another code\.", message)[1])
    assert 1 <= seconds <= 60
    latest = await repo.get_latest_otp(db_session, user.id, OtpPurpose.admin_login)
    assert latest is not None and latest.id == first.id  # nothing new was sent


async def test_resend_after_the_wait_sends_a_new_code(client, db_session):
    data, user, first = await _admin_with_challenge(client, db_session, "adm-resend2@example.com")
    await _age_latest_code(db_session, user, 61)

    res = await _resend(client, data["challenge_token"])

    assert res.status_code == 200
    assert res.json()["message"] == "We sent a new code to your email."
    latest = await repo.get_latest_otp(db_session, user.id, OtpPurpose.admin_login)
    assert latest is not None and latest.id != first.id


async def test_too_many_codes_in_an_hour_says_try_later(client, db_session):
    data, user, _ = await _admin_with_challenge(client, db_session, "adm-resend3@example.com")
    sent = 1  # the code from signing in
    while sent < 5:
        await _age_latest_code(db_session, user, 61)
        assert (await _resend(client, data["challenge_token"])).status_code == 200
        sent += 1
    await _age_latest_code(db_session, user, 61)

    res = await _resend(client, data["challenge_token"])

    assert res.status_code == 429
    assert res.json()["message"] == "Too many codes were asked for. Please try again in 30 minutes."


async def test_owner_and_player_sign_in_as_before(client, db_session):
    for email, role in (("own-same@example.com", "owner"), ("ply-same@example.com", "player")):
        await make_user(client, db_session, email, role=role)
        res = await _login(client, email)
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["access_token"] and data["refresh_token"]
        assert "mfa_required" not in data
