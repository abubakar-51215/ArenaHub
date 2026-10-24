"""Exactly what the server says, and logs, for each kind of bad Google token: always the same 401
words to the phone, and a reason in the log (never the token)."""

import time
from collections.abc import Mapping, Sequence
from typing import Any

import jwt as pyjwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from structlog.testing import capture_logs

from app.core.config import get_settings
from tests.modules.test_google_sign_in import (  # noqa: F401 - google_ready is an autouse fixture
    _CERTS,
    _PEM,
    CLIENT_ID,
    GOOGLE,
    google_ready,
    token,
)

FAILED = "We could not sign you in with Google. Try again."


def _refusals(logs: Sequence[Mapping[str, Any]]) -> list[str]:
    return [str(entry["reason"]) for entry in logs if entry["event"] == "google_token_refused"]


@pytest.mark.parametrize(
    ("bad", "google_says"),
    [
        ({"aud": "other.apps.googleusercontent.com"}, "wrong audience"),
        ({"expires_in": -60}, "expired"),
        ({"verified": False}, None),
    ],
    ids=["wrong audience", "expired", "email not verified"],
)
async def test_each_bad_token_gets_the_same_401_and_a_logged_reason(
    client: AsyncClient, db_session: AsyncSession, bad: dict, google_says: str | None
) -> None:
    with capture_logs() as logs:
        res = await client.post(GOOGLE, json={"id_token": token("e.g@gmail.com", "g-e", **bad)})
    assert res.status_code == 401 and res.json()["message"] == FAILED
    reasons = _refusals(logs)
    assert len(reasons) == 1
    # Google's library raises InvalidValue (a ValueError) for a wrong audience and for an expired
    # token: the logged class is the same, the words differ (checked below); an unverified email
    # is its own reason
    assert reasons[0] == ("InvalidValue" if google_says else "email not verified")


def test_the_librarys_own_words_tell_the_audience_and_expiry_problems_apart() -> None:
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    wrong = token("w@gmail.com", "g-w", aud="other.apps.googleusercontent.com")
    with pytest.raises(ValueError, match="wrong audience"):
        google_id_token.verify_oauth2_token(wrong, google_requests.Request(), audience=[CLIENT_ID])
    old = token("o@gmail.com", "g-o", expires_in=-120)
    with pytest.raises(ValueError, match="(?i)expired|too early|clock"):
        google_id_token.verify_oauth2_token(old, google_requests.Request(), audience=[CLIENT_ID])


async def test_a_token_with_a_bad_signature_is_refused_with_the_signature_reason(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    good = token("s@gmail.com", "g-s")
    head, body, sig = good.split(".")
    tampered = ".".join([head, body, sig[:-4] + ("AAAA" if not sig.endswith("AAAA") else "BBBB")])
    with capture_logs() as logs:
        res = await client.post(GOOGLE, json={"id_token": tampered})
    assert res.status_code == 401 and res.json()["message"] == FAILED
    assert len(_refusals(logs)) == 1


async def test_a_token_with_no_email_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "g-noemail",
        "email_verified": True,
        "iat": now - 10,
        "exp": now + 600,
    }
    no_email = pyjwt.encode(claims, _PEM, algorithm="RS256", headers={"kid": "test-kid"})
    with capture_logs() as logs:
        res = await client.post(GOOGLE, json={"id_token": no_email})
    assert res.status_code == 401 and res.json()["message"] == FAILED
    assert _refusals(logs) == ["email not verified"]  # the one reason used for "no usable email"


async def test_the_server_accepts_a_token_for_any_listed_client_id(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = "second-client.apps.googleusercontent.com"
    monkeypatch.setattr(get_settings(), "google_client_ids_raw", f"{CLIENT_ID}, {other}")
    for aud, sub in ((CLIENT_ID, "g-first"), (other, "g-second")):
        res = await client.post(GOOGLE, json={"id_token": token(f"{sub}@gmail.com", sub, aud=aud)})
        assert res.status_code == 200, res.text
    assert _CERTS  # the test key stood in for Google's keys
