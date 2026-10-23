"""Push delivery: a dead phone is forgotten, tokens never reach a log, the message carries what the
Android channel and a tap need, signing out / deleting the account / a preference each stop pushes,
one token belongs to one device, and the test-push script says only whether it worked."""

import logging
from typing import Any
from urllib.parse import quote

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.push import expo_push
from app.modules.notification import repository as notification_repo
from app.modules.notification.model import DeviceToken
from app.modules.notification.service import notify
from app.modules.user.model import User
from scripts.send_test_push import NO_DEVICE, NO_USER, SENT, send_to
from tests.helpers import auth_header, make_user

GOOD = "ExponentPushToken[good-token-aaaaaaaaaaaa]"
DEAD = "ExponentPushToken[dead-token-bbbbbbbbbbbb]"


def _fake_expo(monkeypatch: pytest.MonkeyPatch, tickets: list[dict[str, Any]]) -> list[list[dict]]:
    sent: list[list[dict]] = []

    def post(messages: list[dict]) -> dict[str, Any]:
        sent.append(messages)
        return {"data": tickets}

    monkeypatch.setattr(expo_push, "_post_sync", post)
    return sent


async def _user(client: AsyncClient, db: AsyncSession, email: str) -> tuple[dict, User]:
    return await make_user(client, db, email, "player")


async def _register(client: AsyncClient, headers: dict, token: str) -> None:
    done = await client.post(
        "/api/v1/notifications/devices",
        headers=auth_header(headers),
        json={"token": token, "platform": "android"},
    )
    assert done.status_code in (200, 201), done.text


async def test_a_token_expo_says_is_gone_is_switched_off_and_the_good_one_stays(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, user = await _user(client, db_session, "push1@example.com")
    await _register(client, headers, GOOD)
    await _register(client, headers, DEAD)
    sent = _fake_expo(
        monkeypatch,
        [
            {"status": "ok", "id": "1"},
            {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}},
        ],
    )
    await notify(db_session, user.id, "booking_confirmed", {"booking_id": "b-1"})
    await db_session.commit()

    assert len(sent) == 1
    assert await notification_repo.list_active_tokens(db_session, user.id) == [GOOD]


async def test_the_message_names_the_android_channel_and_carries_the_event(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, user = await _user(client, db_session, "push2@example.com")
    await _register(client, headers, GOOD)
    sent = _fake_expo(monkeypatch, [{"status": "ok", "id": "1"}])
    await notify(db_session, user.id, "match_joined", {"match_id": "m-1"})
    [[message]] = sent
    assert message["channelId"] == "default" and message["sound"] == "default"
    assert message["data"]["event"] == "match_joined" and message["data"]["match_id"] == "m-1"


async def test_a_failed_push_never_writes_a_token_to_the_log(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(_: list[dict]) -> dict[str, Any]:
        raise OSError("network down")

    monkeypatch.setattr(expo_push, "_post_sync", boom)
    caplog.set_level(logging.DEBUG)
    result = await expo_push.send_push([GOOD], "t", "b", {"event": "x"})
    assert result.error == "OSError" and result.delivered == 0
    shown = capsys.readouterr()
    assert "good-token" not in shown.out + shown.err + caplog.text


async def test_a_notice_the_player_turned_off_sends_no_push(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers, user = await _user(client, db_session, "push3@example.com")
    await _register(client, headers, GOOD)
    user.notification_preferences = {"push": {"booking": False}}
    await db_session.commit()
    sent = _fake_expo(monkeypatch, [{"status": "ok", "id": "1"}])
    await notify(db_session, user.id, "booking_confirmed", {"booking_id": "b-1"})
    assert sent == []  # the in-app notice is still saved, only the push is skipped


async def test_signing_out_and_deleting_the_account_stop_pushes_to_the_phone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.modules.user.service import delete_account

    headers, user = await _user(client, db_session, "push4@example.com")
    await _register(client, headers, GOOD)
    off = await client.delete(
        f"/api/v1/notifications/devices/{quote(GOOD, safe='')}", headers=auth_header(headers)
    )
    assert off.status_code == 200, off.text
    assert await notification_repo.list_active_tokens(db_session, user.id) == []

    await _register(client, headers, GOOD)
    assert await notification_repo.list_active_tokens(db_session, user.id) == [GOOD]
    await delete_account(db_session, user)
    assert await notification_repo.list_active_tokens(db_session, user.id) == []


async def test_one_phone_belongs_to_one_account_at_a_time(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first_headers, first = await _user(client, db_session, "push5a@example.com")
    second_headers, second = await _user(client, db_session, "push5b@example.com")
    await _register(client, first_headers, GOOD)
    await _register(client, second_headers, GOOD)  # the same phone, a different person signs in
    rows = (
        (await db_session.execute(select(DeviceToken).where(DeviceToken.token == GOOD)))
        .scalars()
        .all()
    )
    assert len(rows) == 1 and rows[0].user_id == second.id
    assert await notification_repo.list_active_tokens(db_session, first.id) == []


async def test_the_test_push_script_says_only_whether_it_worked(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    headers, user = await _user(client, db_session, "push6@example.com")
    assert await send_to(db_session, "nobody@example.com") == NO_USER
    assert await send_to(db_session, "push6@example.com") == NO_DEVICE

    await _register(client, headers, GOOD)
    sent = _fake_expo(monkeypatch, [{"status": "ok", "id": "1"}])
    line = await send_to(db_session, "push6@example.com")
    assert line == SENT
    [[message]] = sent
    assert message["data"] == {"event": "test_push"}
    assert "good-token" not in line

    # a phone Expo no longer knows is switched off and the script says what to do, without the token
    _fake_expo(
        monkeypatch,
        [{"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}}],
    )
    gone = await send_to(db_session, "push6@example.com")
    assert "no longer registered" in gone and "good-token" not in gone
    assert await notification_repo.list_active_tokens(db_session, user.id) == []
    assert "good-token" not in capsys.readouterr().out
