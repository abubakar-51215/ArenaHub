"""The Layout A login-alert email: sent once per new player/owner sign-in and never otherwise."""

import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
import structlog
from fastapi import BackgroundTasks
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import messages
from app.core.config import get_settings
from app.integrations.email.smtp import EmailSendError
from app.integrations.email.templates import owner_login_alert_email, player_login_alert_email
from app.modules.auth import login_alert
from app.modules.auth.login_alert import dispatch_login_alert
from app.modules.user.model import User, UserRole
from app.shared.device import NOT_AVAILABLE
from app.shared.display import karachi_stamp
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, auth_header, last_code, make_admin, make_user


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    """A fake email sender: records every call instead of sending."""
    calls: list[dict] = []

    async def fake(
        to: Any, subject: Any, body: Any, html: Any = None, *, timeout: Any = 8, kind: Any = "email"
    ) -> Any:  # noqa: ANN001, ANN202
        calls.append({"to": to, "subject": subject, "body": body, "html": html, "kind": kind})
        return True

    monkeypatch.setattr(login_alert, "send_email", fake)
    return calls


def _alerts(sent: list[dict]) -> list[dict]:
    return [c for c in sent if c["kind"] == "owner_login_alert"]


def _player_alerts(sent: list[dict]) -> list[dict]:
    return [c for c in sent if c["kind"] == "player_login_alert"]


async def _login(client: AsyncClient, email: str, password: str = PASSWORD, **headers: str) -> Any:
    return await client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": password},
        headers=headers or None,
    )


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
    # the approved greeting/body wording, kept exactly
    assert "Dear Ayesha Khan," in body
    assert "successfully logged into your ArenaHub owner account on " in body
    assert "(Pakistan time)" in body
    assert get_settings().support_email in body
    assert "please change your password right away" in body
    # Layout A's new pieces: badge, title (HTML-only, decorative), details table, "Not you?" box
    assert messages.LOGIN_ALERT_BADGE in mail["html"]
    assert messages.LOGIN_ALERT_TITLE in mail["html"]
    assert messages.LOGIN_ALERT_NOT_YOU_HEADING in mail["html"]
    assert "Name: Ayesha Khan" in body
    assert "Account: alert-owner1@example.com" in body
    assert "Role: Owner" in body
    assert "Signed in with: Password" in body
    assert "Device:" in body and "IP address:" in body
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


async def test_a_successful_player_login_sends_one_role_neutral_alert(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, player = await make_user(client, db_session, "alert-player1@example.com", "player")
    player.full_name = "Bilal Ahmed"
    await db_session.commit()
    sent.clear()

    assert (await _login(client, player.email)).status_code == 200
    mails = _player_alerts(sent)
    assert len(mails) == 1
    mail = mails[0]
    assert mail["to"] == "alert-player1@example.com"
    assert mail["subject"] == "ArenaHub login alert"
    body = mail["body"]
    assert "Dear Bilal Ahmed," in body
    # role-neutral wording: "your ArenaHub account", never "owner account"
    assert "successfully logged into your ArenaHub account on " in body
    assert "owner account" not in body
    assert "Role: Player" in body
    assert "Signed in with: Password" in body
    # a player login raises no owner alert
    assert not _alerts(sent)


async def test_admins_get_no_login_alert(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
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
    assert not _player_alerts(sent)


async def test_a_failing_or_slow_mail_never_breaks_the_login_and_logs_safely(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner4@example.com", "owner")

    for failure in (
        EmailSendError("connection refused", "check the host", temporary=True),
        TimeoutError(),
    ):

        async def broken(
            *args: Any, _f: Any = failure, **kwargs: Any
        ) -> None:  # noqa: ANN002, ANN003, ANN202
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
        # the device/IP shown in the (unsent) email never leak into the failure log either
        assert "Windows" not in str(line) and "Chrome" not in str(line)


async def test_one_login_gives_one_send(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-owner5@example.com", "owner")
    sent.clear()
    await _login(client, owner.email)
    assert len(_alerts(sent)) == 1
    await _login(client, owner.email)
    assert len(_alerts(sent)) == 2  # a second sign-in is a second session


async def test_at_most_five_alert_emails_per_hour_per_account(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-cap@example.com", "owner")
    sent.clear()
    with structlog.testing.capture_logs() as logs:
        for _ in range(7):
            assert (await _login(client, owner.email)).status_code == 200
    assert len(_alerts(sent)) == 5  # capped at five an hour
    skips = [e for e in logs if e["event"] == "login_alert_skipped"]
    assert len(skips) == 2  # the sixth and seventh sign-ins sent nothing
    assert all("alert-cap@example.com" not in str(e) for e in skips)  # never the address


async def test_the_player_switch_off_stops_player_alerts_only(
    client: AsyncClient,
    db_session: AsyncSession,
    sent: list[dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "player_login_alert_enabled", False)
    _, player = await make_user(client, db_session, "switch-player@example.com", "player")
    sent.clear()
    assert (await _login(client, player.email)).status_code == 200
    assert not _player_alerts(sent)  # the emergency switch is off for players

    _, owner = await make_user(client, db_session, "switch-owner@example.com", "owner")
    sent.clear()
    assert (await _login(client, owner.email)).status_code == 200
    assert len(_alerts(sent)) == 1  # owners are never affected by the player switch


async def test_device_is_read_from_the_real_sign_in_request(
    client: AsyncClient, db_session: AsyncSession, sent: list[dict]
) -> None:
    _, owner = await make_user(client, db_session, "alert-device@example.com", "owner")
    sent.clear()
    chrome_ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    res = await _login(client, owner.email, **{"User-Agent": chrome_ua})
    assert res.status_code == 200
    body = _alerts(sent)[0]["body"]
    assert "Device: Chrome on Windows" in body


def test_dispatch_skips_an_admin_or_an_account_with_no_email() -> None:
    emailless = User(id=uuid.uuid4(), full_name="No Email", email=None, role=UserRole.player)
    admin = User(id=uuid.uuid4(), full_name="Admin", email="admin@example.com", role=UserRole.admin)
    for user in (emailless, admin):
        bg = BackgroundTasks()
        dispatch_login_alert(bg, user, signed_in_with="Password")
        assert bg.tasks == []  # nothing scheduled, no error


def test_dispatch_uses_not_available_outside_a_request_context() -> None:
    """Device/IP are read from the request that is signing in; with no request context (as in
    this plain unit call) they fall back to "Not available", never crash or guess."""
    owner = User(
        id=uuid.uuid4(), full_name="No Context", email="nc@example.com", role=UserRole.owner
    )
    bg = BackgroundTasks()
    dispatch_login_alert(bg, owner, signed_in_with="Password")
    assert len(bg.tasks) == 1
    args = bg.tasks[0].args
    assert args[-2:] == (NOT_AVAILABLE, NOT_AVAILABLE)  # (device, ip)


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
        "owner@example.test",
        "Thu, 15-Oct-2026 at 01:54:12 PM",
        "Password",
        "Chrome on Windows",
        "203.0.113.4",
        "help@example.test",
    )
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert 'href="mailto:help@example.test"' in html
    assert html.count("href=") == 1  # the only link allowed: the support address
    assert "src=" not in html and "<img" not in html  # Layout A's header is text, not an image
    assert "Dear <script>" in text  # the plain text part is not HTML, so it is left as typed


def test_the_support_address_comes_from_the_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    assert get_settings().support_email == "support.arenahub@gmail.com"
    first = owner_login_alert_email(
        "A", "a@example.test", "when", "Password", "Not available", "Not available",
        get_settings().support_email,
    )  # fmt: skip
    monkeypatch.setattr(get_settings(), "support_email", "changed@example.test")
    second = owner_login_alert_email(
        "A", "a@example.test", "when", "Password", "Not available", "Not available",
        get_settings().support_email,
    )  # fmt: skip
    assert "support.arenahub@gmail.com" in first[1]
    assert "changed@example.test" in second[1] and "support.arenahub@gmail.com" not in second[1]


def test_both_role_variants_show_the_right_role_and_account_row() -> None:
    _, owner_text, _ = owner_login_alert_email(
        "Ayesha", "ayesha@example.test", "when", "Password", "Not available", "Not available",
        "help@example.test",
    )  # fmt: skip
    _, player_text, _ = player_login_alert_email(
        "Bilal", "bilal@example.test", "when", "Google", "Not available", "Not available",
        "help@example.test",
    )  # fmt: skip
    assert "Role: Owner" in owner_text and "Account: ayesha@example.test" in owner_text
    assert "Role: Player" in player_text and "Account: bilal@example.test" in player_text
    assert "Signed in with: Google" in player_text


def test_unavailable_device_and_ip_show_not_available() -> None:
    _, text, html = owner_login_alert_email(
        "A", "a@example.test", "when", "Password", NOT_AVAILABLE, NOT_AVAILABLE,
        "help@example.test",
    )  # fmt: skip
    assert "Device: Not available" in text
    assert "IP address: Not available" in text
    assert "Not available" in html
