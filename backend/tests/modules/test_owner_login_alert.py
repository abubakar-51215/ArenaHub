"""The login-alert email for arena owners: sent once per new owner sign-in and never otherwise."""

from datetime import UTC, datetime

import pytest
import structlog
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.integrations.email.smtp import EmailSendError
from app.integrations.email.templates import owner_login_alert_email
from app.modules.auth import login_alert
from app.modules.user.model import User
from app.shared.display import karachi_stamp
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, auth_header, last_code, make_admin, make_user


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """A fake email sender: records every call instead of sending."""
    calls: list[dict] = []

    async def fake(to, subject, body, html=None, *, timeout=8, kind="email"):  # noqa: ANN001, ANN202
        calls.append({"to": to, "subject": subject, "body": body, "html": html, "kind": kind})
        return True

    monkeypatch.setattr(login_alert, "send_email", fake)
    return calls


def _alerts(sent: list[dict]) -> list[dict]:
    return [c for c in sent if c["kind"] == "owner_login_alert"]


async def _login(client: AsyncClient, email: str, password: str = PASSWORD):
    return await client.post("/api/v1/auth/login", json={"identifier": email, "password": password})


async def test_a_successful_owner_login_sends_exactly_one_alert(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner1@example.com", "owner")
    owner.full_name = "Ayesha Khan"
    await db_session.commit()
    sent.clear()

    res = await _login(client, owner.email)
    assert res.status_code == 200
    tokens = res.json()["data"]

    mails = _alerts(sent)
    assert len(mails) == 1  # one sign-in, one email
    mail = mails[0]
    assert mail["to"] == "alert-owner1@example.com"
    assert mail["subject"] == "ArenaHub login alert"
    body = mail["body"]
    assert "Dear Ayesha Khan," in body
    assert "successfully logged into your ArenaHub owner account on " in body
    assert "(Pakistan time)" in body
    assert get_settings().support_email in body
    assert "please change your password right away" in body
    for secret in (PASSWORD, tokens["access_token"], tokens["refresh_token"]):
        assert secret not in body
        assert secret not in mail["html"]


async def test_wrong_password_and_refused_logins_send_nothing(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner2@example.com", "owner")
    sent.clear()
    assert (await _login(client, owner.email, "not-the-password")).status_code == 401
    assert not _alerts(sent)

    await db_session.execute(update(User).where(User.id == owner.id).values(is_active=False))
    await db_session.commit()
    refused = await _login(client, owner.email)
    assert refused.status_code == 401  # suspended
    assert not _alerts(sent)


async def test_refresh_and_ordinary_requests_send_nothing(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner3@example.com", "owner")
    tokens = (await _login(client, owner.email)).json()["data"]
    sent.clear()
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 200
    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert (
        await client.get("/api/v1/owner/arenas", headers=auth_header(tokens))
    ).status_code == 200
    assert not _alerts(sent)


async def test_players_and_admins_get_no_alert(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, player = await make_user(client, db_session, "alert-player@example.com", "player")
    assert (await _login(client, player.email)).status_code == 200
    assert not _alerts(sent)

    await make_admin(client, db_session, "alert-admin@example.com")
    sent.clear()
    first = await _login(client, "alert-admin@example.com")
    assert first.status_code == 200 and first.json()["data"]["mfa_required"]
    admin = (
        await db_session.execute(select(User).where(User.email == "alert-admin@example.com"))
    ).scalar_one()
    done = await client.post(
        "/api/v1/auth/admin/verify-code",
        json={
            "challenge_token": first.json()["data"]["challenge_token"],
            "code": last_code(admin.id, OtpPurpose.admin_login),
        },
    )
    assert done.status_code == 200
    assert not _alerts(sent)


async def test_a_failing_or_slow_mail_never_breaks_the_login_and_logs_safely(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner4@example.com", "owner")

    for failure in (
        EmailSendError("connection refused", "check the host", temporary=True),
        TimeoutError(),
    ):

        async def broken(*args, _f=failure, **kwargs):  # noqa: ANN002, ANN003, ANN202
            raise _f

        monkeypatch.setattr(login_alert, "send_email", broken)
        with structlog.testing.capture_logs() as logs:
            res = await _login(client, owner.email)
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["access_token"] and data["refresh_token"]
        lines = [e for e in logs if e["event"] == "owner_login_alert_failed"]
        assert len(lines) == 1
        line = lines[0]
        assert line["owner_id"] == str(owner.id)
        assert line["error"] == type(failure).__name__
        assert "alert-owner4@example.com" not in str(line)  # only a masked address
        assert "@" in line["address"] and "*" in line["address"]
        assert "Dear" not in str(line) and data["access_token"] not in str(line)


async def test_one_login_gives_one_send(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner5@example.com", "owner")
    sent.clear()
    await _login(client, owner.email)
    assert len(_alerts(sent)) == 1
    await _login(client, owner.email)
    assert len(_alerts(sent)) == 2  # a second sign-in is a second session


def test_karachi_time_is_written_with_seconds_and_the_right_day() -> None:
    assert karachi_stamp(datetime(2026, 10, 14, 20, 0, 0, tzinfo=UTC)) == (
        "Thu, 15-Oct-2026 at 01:00:00 AM"
    )
    assert karachi_stamp(datetime(2026, 10, 14, 19, 0, 0, tzinfo=UTC)) == (
        "Thu, 15-Oct-2026 at 12:00:00 AM"
    )
    assert karachi_stamp(datetime(2026, 10, 15, 7, 0, 0, tzinfo=UTC)) == (
        "Thu, 15-Oct-2026 at 12:00:00 PM"
    )
    assert karachi_stamp(datetime(2026, 10, 15, 8, 54, 12, tzinfo=UTC)) == (
        "Thu, 15-Oct-2026 at 01:54:12 PM"
    )


def test_the_html_escapes_the_name_and_has_one_mailto_and_nothing_remote() -> None:
    _, text, html = owner_login_alert_email(
        '<script>alert("x")</script> & O\'Neil',
        "Thu, 15-Oct-2026 at 01:54:12 PM",
        "help@example.test",
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert 'href="mailto:help@example.test"' in html
    assert html.count("href=") == 1
    # (the xmlns name in the page tag is a label, not an address that is fetched)
    assert "src=" not in html and 'href="http' not in html and "<img" not in html
    assert "Dear <script>" in text  # the plain text part is not HTML, so it is left as typed


def test_the_support_address_comes_from_the_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    assert get_settings().support_email == "support.arenahub@gmail.com"
    first = owner_login_alert_email("A", "when", get_settings().support_email)
    monkeypatch.setattr(get_settings(), "support_email", "changed@example.test")
    second = owner_login_alert_email("A", "when", get_settings().support_email)
    assert "support.arenahub@gmail.com" in first[1]
    assert "changed@example.test" in second[1] and "support.arenahub@gmail.com" not in second[1]
