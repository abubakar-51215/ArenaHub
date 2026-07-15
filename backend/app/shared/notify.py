"""Notification dispatch seam. Persists an in-app notification and
best-effort delivers push/email via ``modules/notification`` (Sprint 5).

Reuses the caller's own request-scoped session rather than opening a second
one — the caller already has a ``db`` in scope, and a second concurrent
session/engine would be a distinct connection pool from the request's (in
tests, bound to a different, possibly already-closed, event loop). The
caller's existing commit persists the notification alongside whatever else
it's committing.
"""

import uuid

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification import service as notification_service

log = structlog.get_logger()


async def notify_user(db: AsyncSession, user_id: uuid.UUID, event: str, **context: object) -> None:
    # structlog's log.info(msg, ...) already binds "event" internally to the
    # message itself, so a caller-supplied "event" kwarg would collide.
    log.info("notify_dispatch", user_id=str(user_id), notification_type=event, **context)
    await notification_service.notify(db, user_id, event, context)
