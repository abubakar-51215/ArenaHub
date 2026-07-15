"""Notification module tests: in-app persistence + channel preference gating,
plus the notification-center/device-registration endpoints."""

from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification import repository as notif_repo
from app.modules.notification import service as notif_service
from tests.helpers import auth_header, make_user


async def test_notify_persists_in_app_notification(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "notifyplayer1@example.com")

    created = await notif_service.notify(
        db_session, user.id, "booking_confirmed", {"booking_id": "abc123"}
    )

    assert created is not None
    assert created.title == "Booking confirmed"
    assert created.data == {"booking_id": "abc123"}

    unread = await notif_repo.count_unread(db_session, user.id)
    assert unread == 1


async def test_notify_unknown_event_falls_back_to_default(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "notifyplayer2@example.com")

    created = await notif_service.notify(db_session, user.id, "something_unmapped", {})

    assert created is not None
    assert created.title == "ArenaHub update"


async def test_notify_respects_disabled_push_preference(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: MonkeyPatch
) -> None:
    _, user = await make_user(client, db_session, "notifyplayer3@example.com")
    user.notification_preferences = {"push": {"booking": False}}
    await db_session.commit()

    sent: list[str] = []

    async def _fake_send_push(
        tokens: list[str], title: str, body: str, data: dict[str, str]
    ) -> None:
        sent.append(title)

    monkeypatch.setattr("app.modules.notification.service.send_push", _fake_send_push)

    await notif_service.notify(db_session, user.id, "booking_confirmed", {"booking_id": "x"})

    assert sent == []


async def test_notification_center_list_and_mark_read(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "notifyplayer4@example.com")
    h = auth_header(tokens)

    await notif_service.notify(db_session, user.id, "booking_confirmed", {"booking_id": "a"})
    await notif_service.notify(db_session, user.id, "booking_cancelled", {"booking_id": "b"})

    listed = await client.get("/api/v1/notifications", headers=h)
    assert listed.status_code == 200
    data = listed.json()["data"]
    assert data["total"] == 2
    assert data["unread_count"] == 2

    notification_id = data["items"][0]["id"]
    marked = await client.patch(f"/api/v1/notifications/{notification_id}/read", headers=h)
    assert marked.status_code == 200
    assert marked.json()["data"]["read_at"] is not None

    unread = await notif_repo.count_unread(db_session, user.id)
    assert unread == 1

    mark_all = await client.post("/api/v1/notifications/read-all", headers=h)
    assert mark_all.status_code == 200
    assert await notif_repo.count_unread(db_session, user.id) == 0


async def test_register_and_unregister_device_token(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, _ = await make_user(client, db_session, "notifyplayer5@example.com")
    h = auth_header(tokens)

    registered = await client.post(
        "/api/v1/notifications/devices",
        headers=h,
        json={"token": "ExponentPushToken[abc]", "platform": "android"},
    )
    assert registered.status_code == 201

    # Re-registering the same token is an upsert, not a duplicate/error.
    registered_again = await client.post(
        "/api/v1/notifications/devices",
        headers=h,
        json={"token": "ExponentPushToken[abc]", "platform": "android"},
    )
    assert registered_again.status_code == 201

    unregistered = await client.delete(
        "/api/v1/notifications/devices/ExponentPushToken[abc]", headers=h
    )
    assert unregistered.status_code == 200
