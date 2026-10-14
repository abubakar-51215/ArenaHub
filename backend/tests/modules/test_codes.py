"""The rules every emailed code follows (app/shared/codes.py), without any real network."""

from datetime import timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from structlog.testing import capture_logs

from app.core.config import Environment, get_settings
from app.integrations.email.smtp import EmailSendError
from app.modules.auth import repository as repo
from app.modules.auth.model import OtpVerification
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, auth_header, last_code, make_user

REGISTER = "/api/v1/auth/register"
VERIFY = "/api/v1/auth/verify-otp"
RESEND = "/api/v1/auth/resend-otp"
FORGOT = "/api/v1/auth/forgot-password"
_phone = iter(range(3_100_000_000, 3_200_000_000))


async def _register(client: AsyncClient, email: str):
    return await client.post(
        REGISTER,
        json={
            "full_name": "Code Tester",
            "email": email,
            "phone": f"0{next(_phone)}",
            "password": PASSWORD,
            "role": "player",
        },
    )


async def _unverified(client: AsyncClient, db: AsyncSession, email: str):
    assert (await _register(client, email)).status_code == 201
    return await repo.get_user_by_email(db, email)


async def _clear_waits(fake_redis, db: AsyncSession, user) -> None:
    """Pretend 61 s have passed: the per-address wait and the per-account one."""
    for key in await fake_redis.keys("codes:*:cool"):
        await fake_redis.delete(key)
    rows = (
        await db.scalars(select(OtpVerification).where(OtpVerification.user_id == user.id))
    ).all()
    for row in rows:
        row.expires_at -= timedelta(seconds=61)
    await db.commit()


def _wrong(code: str) -> str:
    return "000000" if code != "000000" else "111111"


async def test_only_a_keyed_hash_is_stored_and_the_right_code_works_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _unverified(client, db_session, "c-right@example.com")
    code = last_code(user.id, OtpPurpose.registration)
    row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert not hasattr(OtpVerification, "code")
    assert len(row.code_hash) == 64 and code not in row.code_hash
    assert row.code_hash == codes.code_hash(
        code, user_id=user.id, purpose=OtpPurpose.registration, destination=user.email
    )
    ok = await client.post(VERIFY, json={"email": user.email, "code": code})
    assert ok.status_code == 200
    again = await client.post(VERIFY, json={"email": user.email, "code": code})
    assert again.status_code == 409  # already verified; the code is spent


async def test_wrong_expired_and_locked(client: AsyncClient, db_session: AsyncSession) -> None:
    user = await _unverified(client, db_session, "c-wrong@example.com")
    code = last_code(user.id, OtpPurpose.registration)
    wrong = await client.post(VERIFY, json={"email": user.email, "code": _wrong(code)})
    assert wrong.status_code == 422 and wrong.json()["message"] == codes.WRONG_CODE_MESSAGE
    for _ in range(3):
        await client.post(VERIFY, json={"email": user.email, "code": _wrong(code)})
    fifth = await client.post(VERIFY, json={"email": user.email, "code": _wrong(code)})
    assert fifth.json()["message"] == "Too many wrong tries. Ask for a new code."
    locked = await client.post(VERIFY, json={"email": user.email, "code": code})
    assert locked.json()["message"] == "Too many wrong tries. Ask for a new code."

    other = await _unverified(client, db_session, "c-expired@example.com")
    row = await repo.get_latest_otp(db_session, other.id, OtpPurpose.registration)
    row.expires_at -= timedelta(minutes=11)
    await db_session.commit()
    expired = await client.post(
        VERIFY, json={"email": other.email, "code": last_code(other.id, OtpPurpose.registration)}
    )
    assert expired.status_code == 422 and expired.json()["message"] == codes.WRONG_CODE_MESSAGE


async def test_a_new_code_ends_the_old_one_and_the_wait_is_in_seconds(
    client: AsyncClient, db_session: AsyncSession, fake_redis
) -> None:
    user = await _unverified(client, db_session, "c-new@example.com")
    first = last_code(user.id, OtpPurpose.registration)
    # right after sign-up: the same answer any address gets, and no new code
    quiet = await client.post(RESEND, json={"email": user.email})
    assert quiet.status_code == 200 and last_code(user.id, OtpPurpose.registration) == first
    soon = await client.post(RESEND, json={"email": user.email})
    assert soon.status_code == 429
    seconds = int(soon.json()["message"].split()[1])
    assert 1 <= seconds <= 60
    await _clear_waits(fake_redis, db_session, user)
    assert (await client.post(RESEND, json={"email": user.email})).status_code == 200
    second = last_code(user.id, OtpPurpose.registration)
    if first == second:
        pytest.skip("the two random codes are the same")
    old = await client.post(VERIFY, json={"email": user.email, "code": first})
    assert old.status_code == 422
    assert (
        await client.post(VERIFY, json={"email": user.email, "code": second})
    ).status_code == 200


async def test_hourly_maximum(client: AsyncClient, db_session: AsyncSession, fake_redis) -> None:
    """At most 5 codes an hour for an account; the 6th request an hour for an address is told
    to try later (the same for every address)."""
    user = await _unverified(client, db_session, "c-hour@example.com")
    for _ in range(5):
        await _clear_waits(fake_redis, db_session, user)
        assert (await client.post(RESEND, json={"email": user.email})).status_code == 200
    made = await repo.count_recent_otps(
        db_session, user.id, OtpPurpose.registration, timedelta(hours=1)
    )
    assert made == 5  # the sign-up code + 4; the 5th request sent nothing
    await _clear_waits(fake_redis, db_session, user)
    over = await client.post(RESEND, json={"email": user.email})
    assert over.status_code == 429
    assert over.json()["message"] == codes.TOO_MANY_CODES_MESSAGE


async def test_unknown_and_known_addresses_get_the_same_answers(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_user(client, db_session, "c-known@example.com")
    for url in (RESEND, FORGOT):
        answers = []
        for email in ("c-known@example.com", "c-nobody@example.com"):
            first = await client.post(url, json={"email": email})
            second = await client.post(url, json={"email": email})
            answers.append(
                (
                    first.status_code,
                    first.json()["message"],
                    second.status_code,
                    second.json()["message"][:5],
                )
            )
        assert answers[0] == answers[1], (url, answers)


async def test_a_failed_send_is_said_and_resend_works_without_counting(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    async def broken(*args, **kwargs):
        raise EmailSendError("cannot connect or timed out", "Check EMAIL_HOST.", temporary=True)

    monkeypatch.setattr(codes, "send_email", broken)
    reg = await _register(client, "c-fail@example.com")
    assert reg.status_code == 201  # the account is still created
    assert reg.json()["data"]["code_sent"] is False
    assert reg.json()["message"] == "We could not send the code. Tap Resend."
    user = await repo.get_user_by_email(db_session, "c-fail@example.com")
    row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert row.delivery_failed is True

    async def works(*args, **kwargs):
        return True

    monkeypatch.setattr(codes, "send_email", works)
    again = await client.post(RESEND, json={"email": "c-fail@example.com"})  # no 60 s wait
    assert again.status_code == 200
    assert (
        await repo.count_recent_otps(
            db_session, user.id, OtpPurpose.registration, timedelta(hours=1)
        )
        == 1
    )
    code = last_code(user.id, OtpPurpose.registration)
    assert (await client.post(VERIFY, json={"email": user.email, "code": code})).status_code == 200


async def test_a_code_never_works_for_another_purpose(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    user = await _unverified(client, db_session, "c-purpose@example.com")
    code = last_code(user.id, OtpPurpose.registration)
    reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"email": user.email, "otp": code, "new_password": "N3w-Passw0rd!"},
    )
    assert reset.status_code == 422


async def test_unverified_sign_in_is_told_to_verify_and_gets_a_code(
    client: AsyncClient, db_session: AsyncSession, fake_redis
) -> None:
    user = await _unverified(client, db_session, "c-login@example.com")
    await _clear_waits(fake_redis, db_session, user)
    res = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
    assert res.status_code == 403
    body = res.json()
    assert body["message"] == "Verify your email to continue."
    assert body["data"] == {"email": user.email, "sent_to": "c***@example.com", "code_sent": True}
    code = last_code(user.id, OtpPurpose.registration)
    assert (await client.post(VERIFY, json={"email": user.email, "code": code})).status_code == 200


async def test_reset_ends_every_session(client: AsyncClient, db_session: AsyncSession) -> None:
    tokens, user = await make_user(client, db_session, "c-reset@example.com")
    await client.post(FORGOT, json={"email": user.email})
    code = last_code(user.id, OtpPurpose.password_reset)
    res = await client.post(
        "/api/v1/auth/reset-password",
        json={"email": user.email, "otp": code, "new_password": "N3w-Passw0rd!"},
    )
    assert res.status_code == 200
    me = await client.get("/api/v1/users/me", headers=auth_header(tokens))
    assert me.status_code == 401
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 401


async def test_change_email_asks_the_password_binds_the_code_and_tells_the_old_address(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    tokens, user = await make_user(client, db_session, "c-old@example.com")
    h = auth_header(tokens)
    no = await client.post(
        "/api/v1/users/me/email",
        headers=h,
        json={"new_email": "c-new2@example.com", "current_password": "wrong"},
    )
    assert no.status_code == 422
    yes = await client.post(
        "/api/v1/users/me/email",
        headers=h,
        json={"new_email": "c-new2@example.com", "current_password": PASSWORD},
    )
    assert yes.status_code == 200
    code = last_code(user.id, OtpPurpose.email_change)
    row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.email_change)
    # bound to the NEW address: the same code for another address would not match
    assert row.code_hash == codes.code_hash(
        code, user_id=user.id, purpose=OtpPurpose.email_change, destination="c-new2@example.com"
    )
    assert row.code_hash != codes.code_hash(
        code, user_id=user.id, purpose=OtpPurpose.email_change, destination="c-old@example.com"
    )
    await db_session.refresh(user)
    assert user.email == "c-old@example.com"  # the old address stays until the code is accepted

    sent: list[str] = []

    async def capture(to, subject, *args, **kwargs):
        sent.append(f"{to}|{subject}")
        return True

    from app.modules.user import service as user_service

    monkeypatch.setattr(user_service, "send_email", capture)
    done = await client.post("/api/v1/users/me/email/verify", headers=h, json={"code": code})
    assert done.status_code == 200
    await db_session.refresh(user)
    assert user.email == "c-new2@example.com"
    assert sent == ["c-old@example.com|Your ArenaHub email was changed"]


async def test_admin_code_flow(client: AsyncClient, db_session: AsyncSession) -> None:
    from tests.helpers import make_admin

    await make_admin(client, db_session, "c-admin@example.com")
    login = await client.post(
        "/api/v1/auth/login", json={"email": "c-admin@example.com", "password": PASSWORD}
    )
    challenge = login.json()["data"]["challenge_token"]
    user = await repo.get_user_by_email(db_session, "c-admin@example.com")
    code = last_code(user.id, OtpPurpose.admin_login)
    ok = await client.post(
        "/api/v1/auth/admin/verify-code", json={"challenge_token": challenge, "code": code}
    )
    assert ok.status_code == 200 and ok.json()["data"]["access_token"]


async def test_the_compare_is_constant_time(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    calls = []
    real = codes.hmac.compare_digest

    def spy(a, b):
        calls.append(1)
        return real(a, b)

    monkeypatch.setattr(codes.hmac, "compare_digest", spy)
    user = await _unverified(client, db_session, "c-ct@example.com")
    await client.post(VERIFY, json={"email": user.email, "code": "123456"})
    assert calls, "codes are compared with hmac.compare_digest"


async def test_no_code_or_hash_reaches_the_log_outside_dev(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    settings = get_settings()
    issued: list[str] = []
    real_generate = codes.generate_code

    def remember() -> str:
        value = real_generate()
        issued.append(value)
        return value

    async def sent(*args, **kwargs):
        return True

    monkeypatch.setattr(codes, "generate_code", remember)
    monkeypatch.setattr(codes, "send_email", sent)
    monkeypatch.setattr(settings, "environment", Environment.prod)
    with capture_logs() as logs:
        reg = await _register(client, "c-prod@example.com")
        assert reg.status_code == 201
        user = await repo.get_user_by_email(db_session, "c-prod@example.com")
        row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
        await client.post(VERIFY, json={"email": user.email, "code": "000000"})
        await client.post(FORGOT, json={"email": user.email})
    assert issued, "a code was made"
    flat = repr(logs)
    for value in [*issued, row.code_hash]:
        assert value not in flat, "a code or its hash was logged outside dev"
    assert codes.dev_last_code(user.id, OtpPurpose.registration) is None  # no outbox outside dev
