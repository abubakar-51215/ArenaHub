"""Admin sign-in with an emailed code.

/auth/login gives an admin with the right password no tokens: it emails an
admin_login code and returns a 10-minute challenge token. The code and the
challenge go to /auth/admin/verify-code for the normal tokens. Owners and
players sign in exactly as before.
"""

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, last_code, make_admin, make_user


async def _login(client: AsyncClient, email: str, password: str = PASSWORD) -> Any:
    return await client.post("/api/v1/auth/login", json={"email": email, "password": password})


async def _verify(client: AsyncClient, challenge: str, code: str) -> Any:
    return await client.post(
        "/api/v1/auth/admin/verify-code", json={"challenge_token": challenge, "code": code}
    )


async def _admin_with_challenge(client: AsyncClient, db: AsyncSession, email: str) -> Any:
    await make_admin(client, db, email)
    res = await _login(client, email)
    assert res.status_code == 200
    user = await repo.get_user_by_email(db, email)
    assert user is not None
    otp: Any = await repo.get_latest_otp(db, user.id, OtpPurpose.admin_login)
    assert otp is not None
    otp.plain_code = last_code(user.id, OtpPurpose.admin_login)
    return res.json()["data"], user, otp


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def test_admin_with_the_right_password_gets_no_tokens_and_a_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-step@example.com")

    assert data["mfa_required"] is True
    assert data["challenge_token"] and data["expires_in"] == 600
    assert data["sent_to"] == "a***@example.com" and data["code_sent"] is True
    assert "access_token" not in data and "refresh_token" not in data
    assert len(otp.plain_code) == 6 and otp.plain_code.isdigit()


async def test_wrong_code_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-wrong@example.com")

    res = await _verify(client, data["challenge_token"], _wrong(otp.plain_code))

    assert res.status_code == 422
    assert "That code is not right" in res.json()["message"]


async def test_expired_code_is_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-old@example.com")
    otp.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()

    res = await _verify(client, data["challenge_token"], otp.plain_code)

    assert res.status_code == 422


async def test_right_code_returns_the_normal_tokens(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-ok@example.com")

    res = await _verify(client, data["challenge_token"], otp.plain_code)

    assert res.status_code == 200
    tokens = res.json()["data"]
    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200 and me.json()["data"]["role"] == "admin"
    # the code is used up
    assert (await _verify(client, data["challenge_token"], otp.plain_code)).status_code == 422


async def test_five_wrong_codes_need_a_new_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data, _, otp = await _admin_with_challenge(client, db_session, "adm-five@example.com")
    for _ in range(5):
        await _verify(client, data["challenge_token"], _wrong(otp.plain_code))

    res = await _verify(client, data["challenge_token"], otp.plain_code)

    assert res.status_code == 422
    assert "Too many wrong tries" in res.json()["message"]


async def test_a_challenge_does_not_work_for_another_user_or_as_a_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    a, _, _ = await _admin_with_challenge(client, db_session, "adm-a@example.com")
    _, _, otp_b = await _admin_with_challenge(client, db_session, "adm-b@example.com")

    # A's challenge with B's code: checked against A's code, so refused
    assert (await _verify(client, a["challenge_token"], otp_b.plain_code)).status_code == 422
    # a made-up value and a challenge used as an access token: plain 401s
    bad = await _verify(client, "not-a-token", otp_b.plain_code)
    assert bad.status_code == 401 and "Sign in again" in bad.json()["message"]
    me = await client.get(
        "/api/v1/users/me", headers={"Authorization": f"Bearer {a['challenge_token']}"}
    )
    assert me.status_code == 401


async def _resend(client: AsyncClient, challenge: str) -> Any:
    return await client.post("/api/v1/auth/admin/resend-code", json={"challenge_token": challenge})


async def _age_latest_code(db: AsyncSession, user: Any, seconds: int) -> None:
    """Pretend the newest admin code was sent ``seconds`` earlier."""
    latest = await repo.get_latest_otp(db, user.id, OtpPurpose.admin_login)
    assert latest is not None
    latest.expires_at -= timedelta(seconds=seconds)
    await db.commit()


async def test_resend_inside_60_seconds_says_how_long_to_wait(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data, user, first = await _admin_with_challenge(client, db_session, "adm-resend@example.com")

    res = await _resend(client, data["challenge_token"])

    assert res.status_code == 429
    message = res.json()["message"]
    found = re.fullmatch(r"Wait (\d+) seconds before asking for another code\.", message)
    assert found is not None
    seconds = int(found[1])
    assert 1 <= seconds <= 60
    latest = await repo.get_latest_otp(db_session, user.id, OtpPurpose.admin_login)
    assert latest is not None and latest.id == first.id  # nothing new was sent


async def test_resend_after_the_wait_sends_a_new_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    data, user, first = await _admin_with_challenge(client, db_session, "adm-resend2@example.com")
    await _age_latest_code(db_session, user, 61)

    res = await _resend(client, data["challenge_token"])

    assert res.status_code == 200
    assert res.json()["message"] == "We sent a new code to your email."
    latest = await repo.get_latest_otp(db_session, user.id, OtpPurpose.admin_login)
    assert latest is not None and latest.id != first.id


async def test_too_many_codes_in_an_hour_says_try_later(
    client: AsyncClient, db_session: AsyncSession
) -> None:
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


async def test_owner_and_player_sign_in_as_before(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    for email, role in (("own-same@example.com", "owner"), ("ply-same@example.com", "player")):
        await make_user(client, db_session, email, role=role)
        res = await _login(client, email)
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["access_token"] and data["refresh_token"]
        assert "mfa_required" not in data


async def test_admin_sign_in_says_when_the_hourly_maximum_is_reached(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user, _ = await _admin_with_challenge(client, db_session, "adm-hourly@example.com")
    # four more codes this hour; all of them two minutes old, so no 60 s wait is in the way
    for _ in range(4):
        await repo.create_otp(
            db_session,
            user_id=user.id,
            code_hash="0" * 64,
            channel="email",
            purpose=OtpPurpose.admin_login,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
    await db_session.commit()
    rows = await db_session.execute(
        text(
            "UPDATE otp_verifications SET expires_at = now() + interval '8 minutes' "
            "WHERE user_id = :u AND purpose = 'admin_login'"
        ),
        {"u": user.id},
    )
    await db_session.commit()
    assert getattr(rows, "rowcount", None) == 5

    res = await _login(client, "adm-hourly@example.com")
    assert res.status_code == 429
    assert res.json()["message"] == "Too many codes were asked for. Please try again in 30 minutes."
