"""Auth flow tests (DB-backed): register→verify→login→refresh, account
lockout, and refresh-token replay detection (deviation #17)."""

import re
from datetime import timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo
from app.shared.otp import OtpPurpose
from tests.helpers import last_code

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
    otp = await repo.get_latest_otp(db, user.id, OtpPurpose.registration)
    assert otp is not None
    return last_code(user.id, OtpPurpose.registration)


async def _confirm(client: AsyncClient, db: AsyncSession, email: str) -> None:
    code = await _otp_code(db, email)
    resp = await client.post("/api/v1/auth/verify-otp", json={"email": email, "code": code})
    assert resp.status_code == 200, resp.text


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

    # Unverified login: the right password opens the code screen (a fresh code if allowed).
    early = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert early.status_code == 403
    assert early.json()["message"] == "Verify your email to continue."
    assert early.json()["data"]["email"] == email

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

    # 6th attempt: the wait has started, even with the right password (test_sessions_security)
    locked = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json()["message"] == "Too many attempts. Try again in 1 minute."


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
    # a confirmed account refuses (a never-confirmed one is replaced: test_signup_replace.py)
    await _register(client, email="dupe@example.com", phone="03009999999")
    await _confirm(client, db_session, "dupe@example.com")
    again = await _register(client, email="dupe@example.com", phone="03008888888")
    assert again.status_code == 409


async def test_register_weak_password_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    resp = await _register(client, email="weak@example.com", password="weak")
    assert resp.status_code == 422


async def test_resend_otp_issues_fresh_code_and_retires_old(
    client: AsyncClient, db_session: AsyncSession, fake_redis: Any
) -> None:
    await _register(client, email="resend1@example.com", phone="03007777771")
    user = await repo.get_user_by_email(db_session, "resend1@example.com")
    assert user is not None
    first = last_code(user.id, OtpPurpose.registration)

    # right after sign-up: the answer any address gets, no new code; asked again: the wait
    quiet = await client.post("/api/v1/auth/resend-otp", json={"email": "resend1@example.com"})
    assert quiet.status_code == 200 and last_code(user.id, OtpPurpose.registration) == first
    too_soon = await client.post("/api/v1/auth/resend-otp", json={"email": "resend1@example.com"})
    assert too_soon.status_code == 429
    assert re.fullmatch(
        r"Wait \d+ seconds before asking for another code\.", too_soon.json()["message"]
    )

    # the wait is over (the per-address wait lives in Redis, the per-account one on the code)
    for key in await fake_redis.keys("codes:registration:*:cool"):
        await fake_redis.delete(key)
    original = await repo.get_latest_otp(db_session, user.id, OtpPurpose.registration)
    assert original is not None
    original.expires_at -= timedelta(seconds=120)
    await db_session.commit()
    resent = await client.post("/api/v1/auth/resend-otp", json={"email": "resend1@example.com"})
    assert resent.status_code == 200
    second = last_code(user.id, OtpPurpose.registration)

    # the old code no longer works; the new one does
    if first != second:  # 1-in-a-million collision guard
        old = await client.post(
            "/api/v1/auth/verify-otp", json={"email": "resend1@example.com", "code": first}
        )
        assert old.status_code == 422
    verified = await client.post(
        "/api/v1/auth/verify-otp", json={"email": "resend1@example.com", "code": second}
    )
    assert verified.status_code == 200


async def test_resend_otp_does_not_leak_account_existence(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/resend-otp", json={"email": "ghost@example.com"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "If that email can receive a code, we sent one."


async def test_login_ignores_email_case(client: AsyncClient, db_session: AsyncSession) -> None:
    await _register_and_verify(client, db_session, "Mixed.Case@Example.com")
    for typed in ("mixed.case@example.com", "MIXED.CASE@EXAMPLE.COM"):
        resp = await client.post("/api/v1/auth/login", json={"email": typed, "password": PASSWORD})
        assert resp.status_code == 200, resp.text


async def test_register_duplicate_email_ignores_case(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register(client, email="Case.Dupe@example.com", phone="03007770001")
    await _confirm(client, db_session, "Case.Dupe@example.com")
    again = await _register(client, email="case.dupe@EXAMPLE.com", phone="03007770002")
    assert again.status_code == 409


async def _phone_login(client: AsyncClient, who: str, password: str = PASSWORD) -> Any:
    return await client.post("/api/v1/auth/login", json={"identifier": who, "password": password})


async def test_login_by_email_in_the_identifier_field_any_case(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(client, db_session, "Who.Am@Example.com")
    for typed in ("who.am@example.com", "WHO.AM@EXAMPLE.COM", " Who.Am@Example.com "):
        assert (await _phone_login(client, typed)).status_code == 200


async def test_login_by_phone_in_any_pakistani_form(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(client, db_session, "byphone@example.com")  # phone 03001234567
    for typed in ("0300 1234567", "+92 300 1234567", "923001234567", "(0092) 300-1234567"):
        resp = await _phone_login(client, typed)
        assert resp.status_code == 200, (typed, resp.text)
        assert resp.json()["data"]["access_token"]


async def test_login_by_phone_compares_all_digits_for_other_countries(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    reg = await _register(client, email="uk@example.com", phone="+44 7911 123456")
    assert reg.status_code == 201, reg.text
    user = await repo.get_user_by_email(db_session, "uk@example.com")
    assert user is not None
    await client.post(
        "/api/v1/auth/verify-otp",
        json={"email": "uk@example.com", "code": last_code(user.id, OtpPurpose.registration)},
    )
    assert (await _phone_login(client, "00447911123456")).status_code == 200
    assert (await _phone_login(client, "447911 123456")).status_code == 200


async def test_phone_shared_by_two_accounts_is_refused_like_a_wrong_password(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(client, db_session, "share-a@example.com")
    first = await repo.get_user_by_email(db_session, "share-a@example.com")
    assert first is not None
    # old data could hold the same number spelled another way
    twin = await repo.create_user(
        db_session,
        full_name="Twin",
        email="share-b@example.com",
        phone="+92 300 1234567",
        password_hash=first.password_hash,
        role=first.role,
    )
    twin.is_verified = True
    await db_session.commit()

    shared = await _phone_login(client, "03001234567")
    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "share-a@example.com", "password": "Nope-Nope-1"}
    )
    assert shared.status_code == 401
    assert shared.json() == wrong.json()


async def test_unknown_phone_answers_like_a_wrong_password(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_verify(client, db_session, "known@example.com")
    unknown = await _phone_login(client, "03119998887")
    wrong = await _phone_login(client, "03001234567", "Nope-Nope-1")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()
    assert "email/phone" in unknown.json()["message"]


async def test_register_phone_in_another_spelling_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    assert (await _register(client, email="p1@example.com", phone="03001234567")).status_code == 201
    await _confirm(client, db_session, "p1@example.com")
    for spelling in ("+92 300 1234567", "0300-1234567", "923001234567"):
        again = await _register(client, email=f"dup-{len(spelling)}@example.com", phone=spelling)
        assert again.status_code == 409, (spelling, again.text)
        assert again.json()["message"] == "Phone number is already registered."


async def test_admin_still_gets_the_code_step_and_not_by_phone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.helpers import make_admin

    await make_admin(client, db_session, "adm-who@example.com")
    by_email = await _phone_login(client, "adm-who@example.com")
    assert by_email.status_code == 200
    assert by_email.json()["data"]["mfa_required"] is True
    admin = await repo.get_user_by_email(db_session, "adm-who@example.com")
    assert admin is not None
    by_phone = await _phone_login(client, admin.phone or "")
    assert by_phone.status_code == 401
    # the older field still works
    old = await client.post(
        "/api/v1/auth/login", json={"email": "adm-who@example.com", "password": PASSWORD}
    )
    assert old.json()["data"]["mfa_required"] is True


async def test_suspended_account_is_told_only_after_the_right_password(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from sqlalchemy import select

    from app.modules.user.model import User

    email = "suspended-login@example.com"
    await _register_and_verify(client, db_session, email)
    user = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    user.is_active = False
    await db_session.commit()

    right = await client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert right.status_code == 401
    assert right.json()["message"] == "Your account has been suspended."

    # a wrong password, or an address that does not exist, learns nothing
    wrong = await client.post("/api/v1/auth/login", json={"email": email, "password": "WrongP@ss9"})
    nobody = await client.post(
        "/api/v1/auth/login", json={"email": "nobody-here@example.com", "password": PASSWORD}
    )
    assert wrong.status_code == nobody.status_code == 401
    assert wrong.json()["message"] == nobody.json()["message"] == "Invalid email/phone or password."
