"""Continue with Google. Tokens are real RS256 ID tokens signed by a key made for the test; Google's
own library checks them (signature, audience, issuer, expiry). Only the download of Google's public
keys is replaced, so no network is used."""

import time
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.modules.auth import repository as repo
from app.modules.user.model import User
from tests.helpers import PASSWORD, auth_header, make_user

GOOGLE = "/api/v1/auth/google"
PHONE = "/api/v1/auth/google/phone"
LOGIN = "/api/v1/auth/login"
CLIENT_ID = "test-client.apps.googleusercontent.com"

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
_cert = (
    x509.CertificateBuilder()
    .subject_name(_name)
    .issuer_name(_name)
    .public_key(_key.public_key())
    .serial_number(1)
    .not_valid_before(datetime.now(UTC) - timedelta(days=1))
    .not_valid_after(datetime.now(UTC) + timedelta(days=1))
    .sign(_key, hashes.SHA256())
)
_CERTS = {"test-kid": _cert.public_bytes(serialization.Encoding.PEM).decode()}
_PEM = _key.private_bytes(
    serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
)


def token(
    email: str,
    sub: str,
    *,
    aud: str = CLIENT_ID,
    verified: bool = True,
    expires_in: int = 3600,
    name: str = "Google Person",
) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": aud,
        "sub": sub,
        "email": email,
        "email_verified": verified,
        "name": name,
        "iat": now - 10,
        "exp": now + expires_in,
    }
    return pyjwt.encode(claims, _PEM, algorithm="RS256", headers={"kid": "test-kid"})


@pytest.fixture(autouse=True)
def google_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    """Google sign-in set up for the test client id; Google's keys come from the test key."""
    monkeypatch.setattr(get_settings(), "google_client_ids_raw", CLIENT_ID)
    monkeypatch.setattr("google.oauth2.id_token._fetch_certs", lambda *a, **k: _CERTS)


async def _users(db: AsyncSession) -> int:
    return int(await db.scalar(select(func.count()).select_from(User)) or 0)


async def test_a_new_person_gets_a_player_account_that_needs_a_phone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    res = await client.post(GOOGLE, json={"id_token": token("new.g@gmail.com", "g-new")})
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["access_token"] and data["phone_needed"] is True
    assert data["user"]["role"] == "player" and data["user"]["is_verified"] is True
    assert data["user"]["phone"] is None and data["user"]["full_name"] == "Google Person"
    user = await repo.get_user_by_email(db_session, "new.g@gmail.com")
    assert user is not None
    assert user.google_sub == "g-new"
    # no password works for it: the same answer as a wrong password
    for pw in (PASSWORD, ""):
        login = await client.post(
            LOGIN, json={"identifier": "new.g@gmail.com", "password": pw or "x"}
        )
        assert login.status_code in (401, 422)
    wrong = await client.post(LOGIN, json={"identifier": "new.g@gmail.com", "password": PASSWORD})
    assert wrong.json()["message"] == "Invalid email/phone or password."


async def test_a_google_sign_in_sends_a_player_login_alert(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.auth import login_alert

    calls: list[dict] = []

    async def fake(to, subject, body, html=None, *, timeout=8, kind="email"):  # type: ignore[no-untyped-def]  # noqa: E501
        calls.append({"to": to, "kind": kind, "body": body})
        return True

    monkeypatch.setattr(login_alert, "send_email", fake)
    res = await client.post(
        GOOGLE, json={"id_token": token("g.alert@gmail.com", "g-alert", name="Sana Malik")}
    )
    assert res.status_code == 200
    alerts = [c for c in calls if c["kind"] == "player_login_alert"]
    assert len(alerts) == 1
    assert alerts[0]["to"] == "g.alert@gmail.com"
    assert "your ArenaHub account" in alerts[0]["body"]
    assert "Dear Sana Malik," in alerts[0]["body"]
    assert "Signed in with" not in alerts[0]["body"]


async def test_an_existing_player_signs_in_and_gets_linked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "player.g@gmail.com")
    res = await client.post(GOOGLE, json={"id_token": token("player.g@gmail.com", "g-player")})
    assert res.status_code == 200
    assert res.json()["data"]["phone_needed"] is False
    await db_session.refresh(user)
    assert user.google_sub == "g-player"
    # the password still works for a confirmed account
    ok = await client.post(LOGIN, json={"identifier": "player.g@gmail.com", "password": PASSWORD})
    assert ok.status_code == 200


@pytest.mark.parametrize("role", ["owner", "admin"])
async def test_owners_and_admins_must_use_their_password(
    client: AsyncClient, db_session: AsyncSession, role: str
) -> None:
    if role == "admin":
        from tests.helpers import make_admin

        await make_admin(client, db_session, "staff.g@gmail.com")
    else:
        await make_user(client, db_session, "staff.g@gmail.com", role="owner")
    res = await client.post(GOOGLE, json={"id_token": token("staff.g@gmail.com", f"g-{role}")})
    assert res.status_code == 403
    assert res.json()["message"] == "This account must log in with email and password."
    user = await repo.get_user_by_email(db_session, "staff.g@gmail.com")
    assert user is not None
    assert user.google_sub is None


async def test_an_unconfirmed_sign_up_is_confirmed_but_its_password_and_sessions_end(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    # someone else signed up with this email and a password, and never confirmed it
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Somebody Else",
            "email": "taken.g@gmail.com",
            "phone": "03112223344",
            "password": PASSWORD,
            "role": "player",
        },
    )
    assert reg.status_code == 201
    res = await client.post(GOOGLE, json={"id_token": token("taken.g@gmail.com", "g-real")})
    assert res.status_code == 200
    assert res.json()["data"]["password_removed"] is True
    assert "Forgot password" in res.json()["message"]
    user = await repo.get_user_by_email(db_session, "taken.g@gmail.com")
    assert user is not None
    await db_session.refresh(user)
    assert user.is_verified and user.google_sub == "g-real"
    # the password the other person chose no longer works
    old = await client.post(LOGIN, json={"identifier": "taken.g@gmail.com", "password": PASSWORD})
    assert old.status_code == 401
    # and Forgot password still works, to add a password
    forgot = await client.post("/api/v1/auth/forgot-password", json={"email": "taken.g@gmail.com"})
    assert forgot.status_code == 200


async def test_a_session_from_before_the_takeover_is_ended(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.core.security import create_access_token
    from app.modules.auth import tokens

    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Early Bird",
            "email": "early.g@gmail.com",
            "phone": "03112223355",
            "password": PASSWORD,
            "role": "player",
        },
    )
    assert reg.status_code == 201
    user = await repo.get_user_by_email(db_session, "early.g@gmail.com")
    assert user is not None
    before = create_access_token(user.id, "player")
    epoch_before = await tokens.get_session_epoch_ms(str(user.id))
    assert (
        await client.post(GOOGLE, json={"id_token": token("early.g@gmail.com", "g-e")})
    ).status_code == 200
    assert await tokens.get_session_epoch_ms(str(user.id)) != epoch_before
    me = await client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {before}"})
    assert me.status_code == 401


async def test_a_suspended_account_is_told_so(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "suspended.g@gmail.com")
    user.is_active = False
    await db_session.commit()
    res = await client.post(GOOGLE, json={"id_token": token("suspended.g@gmail.com", "g-s")})
    assert res.status_code == 401
    assert res.json()["message"] == "Your account has been suspended."


@pytest.mark.parametrize(
    "bad",
    [
        {"aud": "someone-elses-app.apps.googleusercontent.com"},
        {"expires_in": -120},
        {"verified": False},
    ],
    ids=["wrong audience", "expired", "email not verified"],
)
async def test_tokens_google_would_not_vouch_for_are_refused(
    client: AsyncClient, db_session: AsyncSession, bad: dict
) -> None:
    before = await _users(db_session)
    res = await client.post(GOOGLE, json={"id_token": token("bad.g@gmail.com", "g-bad", **bad)})
    assert res.status_code == 401
    assert res.json()["message"] == "We could not sign you in with Google. Try again."
    assert await _users(db_session) == before


async def test_a_token_signed_by_another_key_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = other.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    now = int(time.time())
    forged = pyjwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "g-forged",
            "email": "forged@gmail.com",
            "email_verified": True,
            "iat": now,
            "exp": now + 600,
        },
        pem,
        algorithm="RS256",
        headers={"kid": "test-kid"},
    )
    res = await client.post(GOOGLE, json={"id_token": forged})
    assert res.status_code == 401


async def test_not_set_up_means_not_available(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "google_client_ids_raw", "")
    res = await client.post(GOOGLE, json={"id_token": token("off.g@gmail.com", "g-off")})
    assert res.status_code == 503
    assert res.json()["message"] == "Google sign-in is not available yet."


async def test_one_more_step_saves_the_phone_and_then_booking_is_allowed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    res = await client.post(GOOGLE, json={"id_token": token("phone.g@gmail.com", "g-phone")})
    tok = res.json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {tok}"}
    # no booking before the phone is saved
    book = await client.post(
        "/api/v1/bookings",
        headers=headers,
        json={
            "court_id": "00000000-0000-0000-0000-000000000000",
            "slot_ids": ["00000000-0000-0000-0000-000000000000"],
            "payment_type": "full",
        },
    )
    assert book.status_code == 422
    assert book.json()["message"] == "Add your phone number before you book."

    bad = await client.post(PHONE, headers=headers, json={"phone": "12"})
    assert bad.status_code == 422
    saved = await client.post(PHONE, headers=headers, json={"phone": "0300 7654321"})
    assert saved.status_code == 200 and saved.json()["data"]["phone"] == "0300 7654321"
    again = await client.post(GOOGLE, json={"id_token": token("phone.g@gmail.com", "g-phone")})
    assert again.json()["data"]["phone_needed"] is False
    twice = await client.post(PHONE, headers=headers, json={"phone": "0300 7654322"})
    assert twice.status_code == 409


async def test_one_more_step_refuses_a_number_already_registered(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, other = await make_user(client, db_session, "has.phone@gmail.com")
    res = await client.post(GOOGLE, json={"id_token": token("dup.g@gmail.com", "g-dup")})
    headers = {"Authorization": f"Bearer {res.json()['data']['access_token']}"}
    dup = await client.post(PHONE, headers=headers, json={"phone": other.phone})
    assert dup.status_code == 409
    assert dup.json()["message"] == "Phone number is already registered."


async def test_the_same_token_twice_never_makes_two_accounts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    t = token("replay.g@gmail.com", "g-replay")
    before = await _users(db_session)
    first = await client.post(GOOGLE, json={"id_token": t})
    second = await client.post(GOOGLE, json={"id_token": t})
    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["user"]["id"] == second.json()["data"]["user"]["id"]
    assert await _users(db_session) == before + 1


async def test_one_google_account_on_two_emails_stays_one_account(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await client.post(GOOGLE, json={"id_token": token("old.addr@gmail.com", "g-same")})
    before = await _users(db_session)
    # the person changed their Gmail address: the Google account (sub) is the same
    later = await client.post(GOOGLE, json={"id_token": token("new.addr@gmail.com", "g-same")})
    assert later.status_code == 200
    assert later.json()["data"]["user"]["id"] == first.json()["data"]["user"]["id"]
    assert await _users(db_session) == before
    # and another Google account cannot take an email that is linked already
    other = await client.post(GOOGLE, json={"id_token": token("old.addr@gmail.com", "g-other")})
    assert other.status_code == 401


async def test_the_phone_route_needs_a_sign_in(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    res = await client.post(PHONE, json={"phone": "03001234567"})
    assert res.status_code in (401, 403)


async def test_a_player_signed_in_with_a_password_cannot_overwrite_a_phone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tok, _ = await make_user(client, db_session, "keeps.phone@gmail.com")
    res = await client.post(PHONE, headers=auth_header(tok), json={"phone": "03009998887"})
    assert res.status_code == 409
