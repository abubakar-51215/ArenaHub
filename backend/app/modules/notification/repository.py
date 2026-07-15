"""Data access for notifications and device tokens.

Repository layer: queries and inserts only. Callers own the transaction.
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification.model import DeviceToken, Notification
from app.modules.user.model import User


async def add_notification(db: AsyncSession, notification: Notification) -> Notification:
    db.add(notification)
    await db.flush()
    return notification


async def list_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, limit: int, offset: int
) -> tuple[list[Notification], int]:
    total = await db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id)
    )
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all()), int(total or 0)


async def count_unread(db: AsyncSession, user_id: uuid.UUID) -> int:
    total = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return int(total or 0)


async def get_notification(db: AsyncSession, notification_id: uuid.UUID) -> Notification | None:
    return await db.get(Notification, notification_id)


async def mark_all_read(db: AsyncSession, user_id: uuid.UUID, now: datetime) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        .values(read_at=now)
    )


async def upsert_device_token(
    db: AsyncSession, user_id: uuid.UUID, token: str, platform: str
) -> DeviceToken:
    existing = await db.scalar(select(DeviceToken).where(DeviceToken.token == token))
    if existing is not None:
        existing.user_id = user_id
        existing.platform = platform
        existing.is_active = True
        await db.flush()
        return existing
    device = DeviceToken(user_id=user_id, token=token, platform=platform)
    db.add(device)
    await db.flush()
    return device


async def deactivate_device_token(db: AsyncSession, user_id: uuid.UUID, token: str) -> None:
    await db.execute(
        update(DeviceToken)
        .where(DeviceToken.user_id == user_id, DeviceToken.token == token)
        .values(is_active=False)
    )


async def list_active_tokens(db: AsyncSession, user_id: uuid.UUID) -> list[str]:
    result = await db.execute(
        select(DeviceToken.token).where(
            DeviceToken.user_id == user_id, DeviceToken.is_active.is_(True)
        )
    )
    return list(result.scalars().all())


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)
