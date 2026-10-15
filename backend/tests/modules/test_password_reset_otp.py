"""Forgot / reset password with a six-digit emailed code.

Flow: forgot-password emails a code (always answers 200). reset-password takes
email + otp + new_password. The older token path still works.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import get_settings
from app.core.security import verify_password
from app.modules.auth import repository as repo
from app.modules.auth import tokens as token_store
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, auth_header, last_code, make_user

NEW_PASSWORD = "Another#Pass9"


async def _forgot(client: AsyncClient, email: str):
    return await client.post("/api/v1/auth/forgot-password", json={"email": email})


async def _reset(client: AsyncClient, email: str, otp: str, password: str = NEW_PASSWORD):
    return await client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "otp": otp, "new_password": password},
    )


async def _latest_code(db_session: AsyncSession, user) -> str:
    otp = await repo.get_latest_otp(db_session, user.id, OtpPurpose.password_reset)
    assert otp is not None, "no outstanding code"
    return last_code(user.id, OtpPurpose.password_reset)


async def test_forgot_password_issues_a_six_digit_code(client, db_session):
    _, user = await make_user(client, db_session, "rst-issue@example.com")

    res = await _forgot(client, "rst-issue@example.com")

    assert res.status_code == 200
    code = await _latest_code(db_session, user)
    assert len(code) == 6 and code.isdigit()


async def test_forgot_password_for_unknown_email_looks_identical(client, db_session):
    known = await _forgot(client, "nobody-here@example.com")
    _, _ = await make_user(client, db_session, "rst-known@example.com")
    real = await _forgot(client, "rst-known@example.com")

    assert known.status_code == real.status_code == 200
    assert known.json()["message"] == real.json()["message"]


async def test_second_request_inside_the_cooldown_says_how_long_and_sends_no_new_code(
    client, db_session
):
    _, user = await make_user(client, db_session, "rst-cool@example.com")
    await _forgot(client, "rst-cool@example.com")
    first = await _latest_code(db_session, user)

    again = await _forgot(client, "rst-cool@example.com")

    # the same answer an unknown address gets (the wait is counted per address)
    assert again.status_code == 429
    assert again.json()["message"].startswith("Wait ")
    assert await _latest_code(db_session, user) == first


async def test_reset_with_the_code_changes_the_password(client, db_session):
    _, user = await make_user(client, db_session, "rst-ok@example.com")
    await _forgot(client, "rst-ok@example.com")
    code = await _latest_code(db_session, user)

    res = await _reset(client, "rst-ok@example.com", code)

    assert res.status_code == 200
    new_login = await client.post(
        "/api/v1/auth/login", json={"email": "rst-ok@example.com", "password": NEW_PASSWORD}
    )
    old_login = await client.post(
        "/api/v1/auth/login", json={"email": "rst-ok@example.com", "password": PASSWORD}
    )
    assert new_login.status_code == 200
    assert old_login.status_code == 401


async def test_a_used_code_cannot_be_used_twice(client, db_session):
    _, user = await make_user(client, db_session, "rst-once@example.com")
    await _forgot(client, "rst-once@example.com")
    code = await _latest_code(db_session, user)
    assert (await _reset(client, "rst-once@example.com", code)).status_code == 200

    second = await _reset(client, "rst-once@example.com", code, password="Third#Pass123")

    assert second.status_code == 422


async def test_wrong_code_is_rejected_and_five_misses_lock_the_code(client, db_session):
    _, user = await make_user(client, db_session, "rst-bad@example.com")
    await _forgot(client, "rst-bad@example.com")
    code = await _latest_code(db_session, user)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(5):
        assert (await _reset(client, "rst-bad@example.com", wrong)).status_code == 422

    locked = await _reset(client, "rst-bad@example.com", code)
    assert locked.status_code == 422
    assert "Too many wrong tries" in locked.json()["message"]


async def test_reusing_the_current_password_is_rejected_and_the_code_survives(client, db_session):
    _, user = await make_user(client, db_session, "rst-reuse@example.com")
    await _forgot(client, "rst-reuse@example.com")
    code = await _latest_code(db_session, user)

    reused = await _reset(client, "rst-reuse@example.com", code, password=PASSWORD)
    retry = await _reset(client, "rst-reuse@example.com", code, password=NEW_PASSWORD)

    assert reused.status_code == 422
    assert retry.status_code == 200


async def test_weak_new_password_is_rejected(client, db_session):
    _, user = await make_user(client, db_session, "rst-weak@example.com")
    await _forgot(client, "rst-weak@example.com")
    code = await _latest_code(db_session, user)

    res = await _reset(client, "rst-weak@example.com", code, password="alllowercase1!")

    assert res.status_code == 422


async def test_unknown_email_on_reset_gets_the_same_error_as_a_wrong_code(client, db_session):
    _, user = await make_user(client, db_session, "rst-same@example.com")
    await _forgot(client, "rst-same@example.com")

    unknown = await _reset(client, "no-such-user@example.com", "123456")
    wrong = await _reset(client, "rst-same@example.com", "000000")

    assert unknown.status_code == wrong.status_code == 422
    assert unknown.json()["message"] == wrong.json()["message"]


async def test_reset_without_otp_or_token_is_a_validation_error(client):
    res = await client.post("/api/v1/auth/reset-password", json={"new_password": NEW_PASSWORD})

    assert res.status_code == 422


async def test_reset_signs_out_existing_sessions(client, db_session):
    tokens, user = await make_user(client, db_session, "rst-sessions@example.com")
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 200
    await _forgot(client, "rst-sessions@example.com")
    code = await _latest_code(db_session, user)

    assert (await _reset(client, "rst-sessions@example.com", code)).status_code == 200

    after = await client.get("/api/v1/users/me", headers=auth_header(tokens))
    refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert after.status_code == 401
    assert refresh.status_code == 401


class _TickingClock:
    """A clock stuck inside one wall-clock second that moves one millisecond per
    call, so everything below happens in the same second but in a known order."""

    def __init__(self) -> None:
        self._now = datetime.now(UTC).replace(microsecond=0)

    def now(self, tz=None):
        self._now += timedelta(milliseconds=1)
        return self._now


async def test_reset_and_login_in_the_same_second_old_token_dead_new_token_alive(
    client, db_session, monkeypatch
):
    clock = _TickingClock()
    monkeypatch.setattr(security, "datetime", clock)
    monkeypatch.setattr(token_store, "datetime", clock)
    tokens, user = await make_user(client, db_session, "rst-same-second@example.com")
    await _forgot(client, "rst-same-second@example.com")
    code = await _latest_code(db_session, user)

    assert (await _reset(client, "rst-same-second@example.com", code)).status_code == 200
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "rst-same-second@example.com", "password": NEW_PASSWORD},
    )
    assert login.status_code == 200
    fresh = login.json()["data"]

    old_iat = jwt.decode(tokens["access_token"], options={"verify_signature": False})["iat"]
    new_iat = jwt.decode(fresh["access_token"], options={"verify_signature": False})["iat"]
    assert old_iat == new_iat, "the test must run both tokens inside one second"

    old_access = await client.get("/api/v1/users/me", headers=auth_header(tokens))
    old_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    new_access = await client.get("/api/v1/users/me", headers=auth_header(fresh))
    new_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": fresh["refresh_token"]}
    )
    assert old_access.status_code == 401
    assert old_refresh.status_code == 401
    assert new_access.status_code == 200
    assert new_refresh.status_code == 200


async def test_a_token_from_before_the_millisecond_claim_is_still_revoked(client, db_session):
    """Tokens minted before ``iat_ms`` existed carry only whole-second ``iat``."""
    tokens, user = await make_user(client, db_session, "rst-legacy-iat@example.com")
    payload = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    legacy = {k: v for k, v in payload.items() if k != "iat_ms"}
    legacy_token = jwt.encode(
        legacy, get_settings().jwt_secret.get_secret_value(), algorithm="HS256"
    )
    await _forgot(client, "rst-legacy-iat@example.com")
    code = await _latest_code(db_session, user)

    assert (await _reset(client, "rst-legacy-iat@example.com", code)).status_code == 200

    res = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {legacy_token}"})
    assert res.status_code == 401


# --- Reset codes and registration codes never stand in for each other --------


async def _register_unverified(client, db_session, email: str):
    await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Unverified",
            "email": email,
            "phone": f"03{sum(map(ord, email)) * 7919 % 10**9:09d}",
            "password": PASSWORD,
            "role": "player",
        },
    )
    user = await repo.get_user_by_email(db_session, email)
    assert user is not None and not user.is_verified
    return user


async def test_a_registration_code_cannot_reset_a_password(client, db_session):
    user = await _register_unverified(client, db_session, "rst-reg-as-reset@example.com")
    reg = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert reg is not None

    res = await _reset(
        client, "rst-reg-as-reset@example.com", last_code(user.id, OtpPurpose.registration)
    )

    assert res.status_code == 422
    await db_session.refresh(user)
    assert verify_password(PASSWORD, user.password_hash), "the password must not have changed"


async def test_a_reset_code_cannot_verify_an_account(client, db_session):
    user = await _register_unverified(client, db_session, "rst-reset-as-reg@example.com")
    reg = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert reg is not None
    registration_row = reg.id
    assert (await _forgot(client, "rst-reset-as-reg@example.com")).status_code == 200
    reset_row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.password_reset)
    assert reset_row is not None and reset_row.id != registration_row
    reset_code = last_code(user.id, OtpPurpose.password_reset)
    if reset_code == last_code(user.id, OtpPurpose.registration):  # one-in-a-million collision
        pytest.skip("the two random codes are the same")

    res = await client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "rst-reset-as-reg@example.com", "code": reset_code},
    )

    assert res.status_code == 422
    await db_session.refresh(user)
    assert user.is_verified is False


async def test_the_right_code_for_each_purpose_still_works_on_an_unverified_account(
    client, db_session
):
    user = await _register_unverified(client, db_session, "rst-both@example.com")
    assert (await _forgot(client, "rst-both@example.com")).status_code == 200
    reset_code = await _latest_code(db_session, user)
    reg = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert reg is not None

    verified = await client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "rst-both@example.com", "code": last_code(user.id, OtpPurpose.registration)},
    )
    reset = await _reset(client, "rst-both@example.com", reset_code)

    assert verified.status_code == 200
    assert reset.status_code == 200


async def test_codes_for_the_other_flows_cannot_reset_a_password(client, db_session):
    _, user = await make_user(client, db_session, "rst-other-flows@example.com")
    for purpose in (
        OtpPurpose.password_change,
        OtpPurpose.phone_change,
        OtpPurpose.email_change,
        OtpPurpose.registration,
    ):
        await repo.create_otp(
            db_session,
            user_id=user.id,
            code_hash=codes.code_hash(
                "424242", user_id=user.id, purpose=purpose, destination=user.email
            ),
            channel="email",
            purpose=purpose,
            expires_at=datetime.now(UTC) + timedelta(minutes=10),
        )
    await db_session.commit()

    res = await _reset(client, "rst-other-flows@example.com", "424242")

    assert res.status_code == 422


async def test_forgot_password_leaves_the_registration_code_alone(client, db_session):
    user = await _register_unverified(client, db_session, "rst-retire@example.com")
    await _forgot(client, "rst-retire@example.com")

    reg = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)

    assert reg is not None, "requesting a reset must not use up the registration code"


async def test_the_old_reset_link_token_is_gone(client, db_session):
    """Only the 6-digit code resets a password; the old link token is not accepted."""
    await make_user(client, db_session, "rst-token@example.com")
    res = await client.post(
        "/api/v1/auth/reset-password", json={"token": "legacy-token", "new_password": NEW_PASSWORD}
    )
    assert res.status_code == 422


async def test_two_wrong_checks_of_one_code_count_two_attempts(client, db_session):
    _, user = await make_user(client, db_session, "rst-lock@example.com")
    await _forgot(client, "rst-lock@example.com")
    code = await _latest_code(db_session, user)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(2):
        assert (await _reset(client, "rst-lock@example.com", wrong)).status_code == 422

    otp = await repo.get_latest_otp(db_session, user.id, OtpPurpose.password_reset)
    assert otp is not None
    await db_session.refresh(otp)
    assert otp.attempts == 2
