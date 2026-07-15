"""Notification business logic: persist an in-app record and best-effort
deliver it over push + email according to the user's channel preferences
(``User.notification_preferences``, Sprint 5).

``notify`` is the single entrypoint every other module reaches through
``shared/notify.notify_user`` — it owns its own short-lived DB session
(callers fire it without a request-scoped session, same pattern as the
scheduler jobs in ``app/tasks/scheduler.py``).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.integrations.email import send_email
from app.integrations.email.templates import notification_email
from app.integrations.push import send_push
from app.modules.notification import repository as repo
from app.modules.notification.model import Notification
from app.modules.notification.schema import NotificationResponse
from app.modules.user.model import User
from app.shared.pagination import PaginationParams, paginated

EVENT_META: dict[str, dict[str, str]] = {
    "booking_confirmed": {
        "title": "Booking confirmed",
        "body": "Your booking is confirmed. See you on the court!",
        "category": "booking",
    },
    "booking_cancelled": {
        "title": "Booking cancelled",
        "body": "Your booking has been cancelled.",
        "category": "booking",
    },
    "booking_payment_failed": {
        "title": "Payment failed",
        "body": "Payment for your booking could not be completed.",
        "category": "booking",
    },
    "booking_reminder_24h": {
        "title": "Upcoming booking tomorrow",
        "body": "You have a booking starting in about 24 hours.",
        "category": "reminder",
    },
    "booking_reminder_1h": {
        "title": "Booking starting soon",
        "body": "You have a booking starting in about 1 hour.",
        "category": "reminder",
    },
    "new_confirmed_booking": {
        "title": "New booking received",
        "body": "You have {count} new confirmed booking(s).",
        "category": "booking",
    },
    "refund_initiated": {
        "title": "Refund initiated",
        "body": "A refund of PKR {amount} has been initiated for your booking.",
        "category": "payment",
    },
    "account_suspended": {
        "title": "Your account has been suspended",
        "body": "An administrator suspended your account. Reason: {reason}",
        "category": "account",
    },
    "account_reactivated": {
        "title": "Your account is active again",
        "body": "An administrator reactivated your account. You can sign in as usual.",
        "category": "account",
    },
}

DEFAULT_EVENT = {
    "title": "ArenaHub update",
    "body": "You have a new update.",
    "category": "general",
}


def _channel_enabled(user: User, channel: str, category: str) -> bool:
    """``notification_preferences`` is free-form JSON shaped like
    ``{"push": {"booking": true, ...}, "email": {...}}``; an absent key
    defaults to enabled so existing users (empty dict) keep getting notified."""
    channel_prefs = user.notification_preferences.get(channel, {})
    return bool(channel_prefs.get(category, True))


async def notify(
    db: AsyncSession, user_id: uuid.UUID, event: str, context: dict[str, object]
) -> Notification | None:
    """Persist a notification and best-effort deliver it. Does NOT commit —
    it reuses the caller's session/transaction, so the caller's own commit
    (already there for whatever booking/payment change triggered this) is
    what actually persists it; callers with nothing else to commit (e.g. the
    reminder scheduler job) must commit explicitly after calling this."""
    user = await repo.get_user(db, user_id)
    if user is None:
        return None

    meta = EVENT_META.get(event, DEFAULT_EVENT)
    title = meta["title"]
    try:
        body = meta["body"].format(**context)
    except (KeyError, IndexError):
        body = meta["body"]
    category = meta["category"]

    notification = Notification(
        user_id=user_id, event=event, title=title, body=body, data=dict(context)
    )
    await repo.add_notification(db, notification)

    if _channel_enabled(user, "push", category):
        tokens = await repo.list_active_tokens(db, user_id)
        await send_push(tokens, title, body, {k: str(v) for k, v in context.items()})

    if _channel_enabled(user, "email", category):
        subject, text, html = notification_email(title, body)
        await send_email(user.email, subject, text, html=html)

    return notification


async def list_my_notifications(
    db: AsyncSession, user: User, params: PaginationParams
) -> dict[str, object]:
    rows, total = await repo.list_for_user(
        db, user.id, limit=params.page_size, offset=params.offset
    )
    unread = await repo.count_unread(db, user.id)
    page = paginated([NotificationResponse.model_validate(r) for r in rows], total, params)
    page["unread_count"] = unread
    return page


async def mark_read(
    db: AsyncSession, user: User, notification_id: uuid.UUID
) -> NotificationResponse:
    notification = await repo.get_notification(db, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
    return NotificationResponse.model_validate(notification)


async def mark_all_read(db: AsyncSession, user: User) -> None:
    await repo.mark_all_read(db, user.id, datetime.now(UTC))
    await db.commit()


async def register_device(db: AsyncSession, user: User, token: str, platform: str) -> None:
    await repo.upsert_device_token(db, user.id, token, platform)
    await db.commit()


async def unregister_device(db: AsyncSession, user: User, token: str) -> None:
    await repo.deactivate_device_token(db, user.id, token)
    await db.commit()
