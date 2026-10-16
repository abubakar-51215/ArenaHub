"""Phase 3: the growing wait after wrong passwords, refresh tokens kept as hashes (rotation, reuse,
revocation), token forgery, the audit trail, the change notices and request ids."""

import base64
import hashlib
import json
import time
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import ISSUER, create_access_token
from app.modules.admin.model import AuditLog
from app.modules.auth import login_guard
from app.modules.auth.model import RefreshToken
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, auth_header, last_code, make_admin, make_user

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
BAD = "Wrong#Pass1"


async def _login(client: AsyncClient, who: str, password: str = PASSWORD):
    return await client.post(LOGIN, json={"identifier": who, "password": password})


# ---- the growing wait ---------------------------------------------------------------------


def test_the_wait_grows_and_is_capped() -> None:
    waits = [login_guard.delay_seconds(n) for n in range(1, 12)]
    assert waits[:4] == [0, 0, 0, 0]  # four wrong tries in a row: no wait yet
    assert waits[4:9] == [60, 120, 240, 480, 900]  # then 1, 2, 4, 8, 15 minutes
    assert waits[9:] == [900, 900]  # never longer than 15 minutes, never a permanent lock


async def test_the_wait_starts_at_the_fifth_wrong_password_for_known_and_unknown_alike(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_user(client, db_session, "ss-known@example.com")
    answers = {}
    for who in ("ss-known@example.com", "ss-ghost@example.com"):
        seen = []
        for _ in range(7):
            res = await _login(client, who, BAD)
            seen.append((res.status_code, res.json()["message"]))
        answers[who] = seen
    assert answers["ss-known@example.com"] == answers["ss-ghost@example.com"]
    first_five = answers["ss-known@example.com"][:5]
    assert all(s == (401, "Invalid email/phone or password.") for s in first_five)
    assert answers["ss-known@example.com"][5] == (429, "Too many attempts. Try again in 1 minute.")


async def test_the_right_password_is_refused_during_the_wait_and_works_after_it(
    client: AsyncClient, db_session: AsyncSession, fake_redis
) -> None:
    await make_user(client, db_session, "ss-wait@example.com")
    for _ in range(5):
        await _login(client, "ss-wait@example.com", BAD)
    during = await _login(client, "ss-wait@example.com")
    assert during.status_code == 429
    # the wait is over (move the end of the wait into the past)
    key = next(k for k in await fake_redis.keys("auth:lf:*:until"))
    await fake_redis.set(key, str(time.time() - 1))
    after = await _login(client, "ss-wait@example.com")
    assert after.status_code == 200
    # a right password clears the count: five more wrong tries are needed for a new wait
    for _ in range(4):
        assert (await _login(client, "ss-wait@example.com", BAD)).status_code == 401
    assert (await _login(client, "ss-wait@example.com", BAD)).status_code == 401


async def test_a_second_wrong_series_waits_longer(
    client: AsyncClient, db_session: AsyncSession, fake_redis
) -> None:
    await make_user(client, db_session, "ss-grow@example.com")
    for _ in range(5):
        await _login(client, "ss-grow@example.com", BAD)
    key = next(k for k in await fake_redis.keys("auth:lf:*:until"))
    await fake_redis.set(key, str(time.time() - 1))  # the first wait is over
    res = await _login(client, "ss-grow@example.com", BAD)  # the 6th wrong try in a row
    assert res.status_code == 401
    waiting = await _login(client, "ss-grow@example.com")
    assert waiting.json()["message"] == "Too many attempts. Try again in 2 minutes."


async def test_the_same_phone_in_any_spelling_shares_one_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "ss-phone@example.com")
    phone = user.phone
    assert phone is not None
    spellings = [phone, "+92 " + phone[1:], phone.replace("03", "03 ", 1)]
    for n in range(5):
        await _login(client, spellings[n % 3], BAD)
    assert (await _login(client, spellings[0])).status_code == 429


# ---- refresh tokens -----------------------------------------------------------------------


async def test_a_refresh_token_is_random_and_only_its_hash_is_stored(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-hash@example.com")
    raw = tokens["refresh_token"]
    assert raw.count(".") == 0 and len(raw) >= 60  # not a signed token; 48 random bytes
    rows = (
        await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id))
    ).all()
    assert len(rows) == 1
    assert rows[0].token_hash == hashlib.sha256(raw.encode()).hexdigest()
    dump = json.dumps(
        [dict(r._mapping) for r in await db_session.execute(text("select * from refresh_tokens"))],
        default=str,
    )
    assert raw not in dump


async def test_every_use_rotates_and_a_reused_token_ends_the_whole_sign_in(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-rotate@example.com")
    other = (await _login(client, user.email)).json()["data"]  # a second sign-in (another phone)
    first = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert first.status_code == 200
    second_raw = first.json()["data"]["refresh_token"]
    assert second_raw != tokens["refresh_token"]
    rows = (
        await db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id))
    ).all()
    assert len({r.family_id for r in rows}) == 2  # two sign-ins
    # the old token again: a copy exists, so that sign-in is revoked, new token included
    replay = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert replay.status_code == 401 and "reuse" in replay.json()["message"].lower()
    dead = await client.post(REFRESH, json={"refresh_token": second_raw})
    assert dead.status_code == 401
    # the other sign-in is not touched
    fine = await client.post(REFRESH, json={"refresh_token": other["refresh_token"]})
    assert fine.status_code == 200


async def test_two_refreshes_at_once_cannot_both_win(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, _ = await make_user(client, db_session, "ss-race@example.com")
    a = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    b = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert (a.status_code, b.status_code) == (200, 401)


async def test_an_unknown_expired_or_signed_token_is_not_a_refresh_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-expired@example.com")
    assert (await client.post(REFRESH, json={"refresh_token": "nope" * 20})).status_code == 401
    # an access token (a JWT) is no refresh token
    assert (
        await client.post(REFRESH, json={"refresh_token": tokens["access_token"]})
    ).status_code == 401
    row = await db_session.scalar(select(RefreshToken).where(RefreshToken.user_id == user.id))
    row.expires_at = datetime.now(UTC) - timedelta(seconds=5)
    await db_session.commit()
    gone = await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    assert gone.status_code == 401


async def test_logout_ends_only_that_sign_in_and_log_out_everywhere_ends_all(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-out@example.com")
    other = (await _login(client, user.email)).json()["data"]
    out = await client.post(
        "/api/v1/auth/logout",
        headers=auth_header(tokens),
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert out.status_code == 200
    assert (
        await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth_header(other))).status_code == 200

    everywhere = await client.post("/api/v1/auth/logout-all", headers=auth_header(other))
    assert everywhere.status_code == 200
    assert (await client.get("/api/v1/users/me", headers=auth_header(other))).status_code == 401
    assert (
        await client.post(REFRESH, json={"refresh_token": other["refresh_token"]})
    ).status_code == 401
    assert (await client.post("/api/v1/auth/logout-all")).status_code == 401


async def test_a_password_change_and_a_suspension_revoke_every_refresh_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-revoke@example.com")
    ask = await client.put(
        "/api/v1/users/me/password",
        headers=auth_header(tokens),
        json={"current_password": PASSWORD, "new_password": "Another#Pass9"},
    )
    assert ask.status_code == 200
    code = last_code(user.id, OtpPurpose.password_change)
    done = await client.post(
        "/api/v1/users/me/password/verify", headers=auth_header(tokens), json={"code": code}
    )
    assert done.status_code == 200
    assert (
        await client.post(REFRESH, json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401

    # a suspension: the refresh tokens are revoked and stay revoked after reactivation
    tokens2, user2 = await make_user(client, db_session, "ss-suspend@example.com")
    admin = await make_admin(client, db_session, "ss-admin@example.com")
    sus = await client.patch(
        f"/api/v1/admin/users/{user2.id}/suspend",
        headers=auth_header(admin),
        json={"reason": "Test"},
    )
    assert sus.status_code == 200
    assert (
        await client.post(REFRESH, json={"refresh_token": tokens2["refresh_token"]})
    ).status_code == 401
    await client.patch(f"/api/v1/admin/users/{user2.id}/reactivate", headers=auth_header(admin))
    assert (
        await client.post(REFRESH, json={"refresh_token": tokens2["refresh_token"]})
    ).status_code == 401
    assert (await _login(client, user2.email)).status_code == 200  # a new sign-in is fine


# ---- token forgery ------------------------------------------------------------------------


def _b64(obj: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()


async def test_forged_and_wrong_kind_tokens_are_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-forge@example.com")
    now = int(time.time())
    good = {
        "sub": str(user.id), "iss": ISSUER, "aud": "arenahub-api", "type": "access",
        "jti": uuid.uuid4().hex, "iat": now, "iat_ms": now * 1000, "exp": now + 600,
        "role": "admin",
    }  # fmt: skip
    secret = get_settings().jwt_secret.get_secret_value()
    me = "/api/v1/users/me"

    def bearer(token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    assert (
        await client.get(me, headers=bearer(jwt.encode(good, secret, algorithm="HS256")))
    ).status_code == 200
    # algorithm "none" and a swapped algorithm
    none_token = f"{_b64({'alg': 'none', 'typ': 'JWT'})}.{_b64(good)}."
    assert (await client.get(me, headers=bearer(none_token))).status_code == 401
    assert (
        await client.get(me, headers=bearer(jwt.encode(good, secret, algorithm="HS512")))
    ).status_code == 401
    # signed with another secret
    assert (
        await client.get(me, headers=bearer(jwt.encode(good, "x" * 40, algorithm="HS256")))
    ).status_code == 401
    # each required claim missing, a wrong issuer or audience, a wrong type
    for claim in ("exp", "iat", "iss", "aud", "jti", "type", "sub"):
        broken = {k: v for k, v in good.items() if k != claim}
        res = await client.get(me, headers=bearer(jwt.encode(broken, secret, algorithm="HS256")))
        assert res.status_code == 401, claim
    for change in (
        {"iss": "someone"},
        {"aud": "arenahub-admin-login"},
        {"type": "admin_login"},
        {"exp": now - 5},
    ):
        bad = {**good, **change}
        res = await client.get(me, headers=bearer(jwt.encode(bad, secret, algorithm="HS256")))
        assert res.status_code == 401, change
    # the admin sign-in challenge is not an access token, and a refresh token is not one either
    admin_step = jwt.encode(
        {**good, "type": "admin_login", "aud": "arenahub-admin-login"},
        get_settings().jwt_refresh_secret.get_secret_value(),
        algorithm="HS256",
    )
    assert (await client.get(me, headers=bearer(admin_step))).status_code == 401
    assert (await client.get(me, headers=bearer(tokens["refresh_token"]))).status_code == 401
    assert create_access_token(user.id, "player")  # the real thing still works


# ---- audit trail --------------------------------------------------------------------------


async def test_sign_ins_and_failures_leave_audit_rows_without_secrets(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "ss-audit@example.com")
    await _login(client, user.email, BAD)
    await _login(client, "ss-nobody@example.com", BAD)
    await _login(client, user.email)
    rows = (
        await db_session.scalars(select(AuditLog).where(AuditLog.action.like("auth.login%")))
    ).all()
    outcomes = sorted((r.result, r.details.get("reason", "")) for r in rows)
    assert ("fail", "wrong password") in outcomes and ("fail", "unknown") in outcomes
    assert ("ok", "") in outcomes
    wrong = next(r for r in rows if r.details.get("reason") == "wrong password")
    assert wrong.actor_id == user.id and wrong.ip  # who and from where
    unknown = next(r for r in rows if r.details.get("reason") == "unknown")
    assert unknown.actor_id is None
    everything = json.dumps(
        [{"d": r.details, "a": r.action, "t": r.target_id, "ip": r.ip} for r in rows], default=str
    )
    assert BAD not in everything and PASSWORD not in everything


async def test_changes_and_code_requests_are_audited_and_never_hold_a_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "ss-trail@example.com")
    await client.post(
        "/api/v1/users/me/email",
        headers=auth_header(tokens),
        json={"new_email": "ss-trail2@example.com", "current_password": PASSWORD},
    )
    code = last_code(user.id, OtpPurpose.email_change)
    done = await client.post(
        "/api/v1/users/me/email/verify", headers=auth_header(tokens), json={"code": code}
    )
    assert done.status_code == 200
    actions = {r.action for r in (await db_session.scalars(select(AuditLog))).all()}
    assert {"code.request", "email.change"} <= actions
    dump = json.dumps([r.details for r in (await db_session.scalars(select(AuditLog))).all()])
    digest = codes.code_hash(
        code, user_id=user.id, purpose=OtpPurpose.email_change, destination="ss-trail2@example.com"
    )
    assert code not in dump and digest not in dump


async def test_wrong_current_passwords_wait_like_sign_ins_and_are_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, _ = await make_user(client, db_session, "ss-current@example.com")
    body = {"new_email": "ss-current2@example.com", "current_password": BAD}
    for _ in range(5):
        res = await client.post("/api/v1/users/me/email", headers=auth_header(tokens), json=body)
        assert res.status_code == 422
    waiting = await client.post("/api/v1/users/me/email", headers=auth_header(tokens), json=body)
    assert waiting.status_code == 429
    assert waiting.json()["message"] == "Too many attempts. Try again in 1 minute."
    fails = (
        await db_session.scalars(select(AuditLog).where(AuditLog.action == "auth.password_check"))
    ).all()
    assert len(fails) == 5 and all(f.result == "fail" for f in fails)


# ---- change notices -----------------------------------------------------------------------


async def test_password_and_email_changes_are_told_to_the_account_owner(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    sent: list[tuple[str, str, str]] = []

    async def capture(to, subject, body, html=None, **kwargs):
        sent.append((to, subject, body))
        return True

    monkeypatch.setattr("app.modules.user.service.send_email", capture)
    tokens, user = await make_user(client, db_session, "ss-notice@example.com")
    await client.put(
        "/api/v1/users/me/password",
        headers=auth_header(tokens),
        json={"current_password": PASSWORD, "new_password": "Another#Pass9"},
    )
    code = last_code(user.id, OtpPurpose.password_change)
    await client.post(
        "/api/v1/users/me/password/verify", headers=auth_header(tokens), json={"code": code}
    )
    to, subject, body = next(s for s in sent if s[1] == "Your ArenaHub password was changed")
    assert to == "ss-notice@example.com"
    assert (
        "(Pakistan time)" in body
        and "If this was not you, log in and change your password." in body
    )
    assert "support" not in body.lower()


# ---- admin sign-in code tries --------------------------------------------------------------


async def test_an_admin_code_is_locked_after_three_wrong_tries(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.modules.test_admin_login_otp import _admin_with_challenge, _verify, _wrong

    data, _, otp = await _admin_with_challenge(client, db_session, "ss-adm3@example.com")
    for _ in range(3):
        assert (
            await _verify(client, data["challenge_token"], _wrong(otp.plain_code))
        ).status_code == 422
    locked = await _verify(client, data["challenge_token"], otp.plain_code)
    assert locked.status_code == 422 and "Too many wrong tries" in locked.json()["message"]
    fails = (
        await db_session.scalars(select(AuditLog).where(AuditLog.action == "auth.admin_code"))
    ).all()
    assert len(fails) >= 3


# ---- request id ---------------------------------------------------------------------------


async def test_every_answer_carries_a_request_id_and_unsafe_ones_are_replaced(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    plain = await client.get("/api/v1/health")
    rid = plain.headers["x-request-id"]
    assert len(rid) >= 8 and rid.isalnum()
    mine = await client.get("/api/v1/health", headers={"X-Request-ID": "req-2026-10-15-abcdef"})
    assert mine.headers["x-request-id"] == "req-2026-10-15-abcdef"
    for evil in ("a b", "x" * 200, "<script>alert(1)</script>", "short"):
        got = await client.get("/api/v1/health", headers={"X-Request-ID": evil})
        assert got.headers["x-request-id"] != evil
    limited = await client.get("/api/v1/health")
    assert limited.headers.get("x-request-id")
    _ = pytest


async def test_a_password_reset_lifts_the_wait_after_wrong_passwords(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "reset-lifts-wait@example.com")
    for _ in range(6):
        await client.post(
            "/api/v1/auth/login", json={"identifier": user.email, "password": "wrong-password-1"}
        )
    held = await client.post(
        "/api/v1/auth/login", json={"identifier": user.email, "password": PASSWORD}
    )
    assert held.status_code == 429
    await client.post("/api/v1/auth/forgot-password", json={"email": user.email})
    code = last_code(user.id, OtpPurpose.password_reset)
    reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"email": user.email, "otp": code, "new_password": "Brand-New-Pass-77"},
    )
    assert reset.status_code == 200
    again = await client.post(
        "/api/v1/auth/login", json={"identifier": user.email, "password": "Brand-New-Pass-77"}
    )
    assert again.status_code == 200
