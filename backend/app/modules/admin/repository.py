"""Data access for the admin panel: cross-module read queries (users,
platform-wide bookings/payments, dashboard aggregates) plus the audit log.
Repository layer: queries and inserts only. Callers own the transaction.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.admin.model import AuditLog, PlatformSettings
from app.modules.arena.model import Arena, ArenaStatus
from app.modules.booking.model import Booking, BookingStatus
from app.modules.court.model import Court
from app.modules.payment.model import Payment, PaymentMethod
from app.modules.payment.model import PaymentStatus as PayStatus
from app.modules.user.model import User, UserRole

# ---- users -----------------------------------------------------------------


async def list_users(
    db: AsyncSession,
    *,
    role: UserRole | None,
    is_active: bool | None,
    search: str | None,
    offset: int,
    limit: int,
) -> tuple[list[User], int]:
    base = select(User).where(User.deleted_at.is_(None))
    if role is not None:
        base = base.where(User.role == role)
    if is_active is not None:
        base = base.where(User.is_active == is_active)
    if search:
        like = f"%{search}%"
        base = base.where((User.full_name.ilike(like)) | (User.email.ilike(like)))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(User.created_at.desc()).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def count_user_bookings(db: AsyncSession, user_id: uuid.UUID) -> int:
    return (await db.scalar(select(func.count()).where(Booking.player_id == user_id))) or 0


# ---- platform-wide bookings --------------------------------------------------


async def list_all_bookings(
    db: AsyncSession,
    *,
    status: BookingStatus | None,
    arena_id: uuid.UUID | None,
    player_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Booking, str, str, str]], int]:
    base = (
        select(Booking, Arena.name, Court.name, User.full_name)
        .join(Arena, Arena.id == Booking.arena_id)
        .join(Court, Court.id == Booking.court_id)
        .join(User, User.id == Booking.player_id)
    )
    if status is not None:
        base = base.where(Booking.status == status)
    if arena_id is not None:
        base = base.where(Booking.arena_id == arena_id)
    if player_id is not None:
        base = base.where(Booking.player_id == player_id)
    if date_from is not None:
        base = base.where(Booking.booking_date >= date_from)
    if date_to is not None:
        base = base.where(Booking.booking_date <= date_to)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Booking.created_at.desc()).offset(offset).limit(limit))
    return [(b, an, cn, pn) for b, an, cn, pn in result.all()], total


# ---- platform-wide payments --------------------------------------------------


async def list_all_payments(
    db: AsyncSession,
    *,
    status: PayStatus | None,
    method: PaymentMethod | None,
    arena_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Payment, str | None, str]], int]:
    arena_name = (
        select(Arena.name)
        .join(Booking, Booking.arena_id == Arena.id)
        .where(Booking.booking_group_id == Payment.booking_group_id)
        .limit(1)
        .scalar_subquery()
    )
    base = select(Payment, arena_name.label("arena_name"), User.full_name).join(
        User, User.id == Payment.player_id
    )
    if status is not None:
        base = base.where(Payment.status == status)
    if method is not None:
        base = base.where(Payment.payment_method == method)
    if date_from is not None:
        base = base.where(Payment.created_at >= date_from)
    if date_to is not None:
        base = base.where(Payment.created_at <= date_to)
    if arena_id is not None:
        group_ids = select(Booking.booking_group_id).where(Booking.arena_id == arena_id).subquery()
        base = base.where(Payment.booking_group_id.in_(select(group_ids)))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Payment.created_at.desc()).offset(offset).limit(limit))
    return [(p, an, pn) for p, an, pn in result.all()], total


# ---- dashboard metrics --------------------------------------------------


async def count_users_by_role(db: AsyncSession, role: UserRole) -> int:
    return (
        await db.scalar(select(func.count()).where(User.role == role, User.deleted_at.is_(None)))
    ) or 0


async def count_arenas_by_status(db: AsyncSession, status: ArenaStatus) -> int:
    return (await db.scalar(select(func.count()).where(Arena.status == status))) or 0


async def count_bookings_since(db: AsyncSession, since: datetime | None) -> int:
    stmt = select(func.count())
    if since is not None:
        stmt = stmt.where(Booking.created_at >= since)
    return (await db.scalar(stmt)) or 0


async def sum_platform_revenue(db: AsyncSession) -> float:
    total = await db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.status == PayStatus.completed
        )
    )
    return float(total or 0)


# ---- audit log --------------------------------------------------


async def add_audit_log(db: AsyncSession, log: AuditLog) -> AuditLog:
    db.add(log)
    await db.flush()
    return log


async def list_audit_logs(
    db: AsyncSession, *, action: str | None, offset: int, limit: int
) -> tuple[list[AuditLog], int]:
    base = select(AuditLog)
    if action:
        base = base.where(AuditLog.action == action)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        base.options(selectinload(AuditLog.actor))
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all()), total


# ---- platform settings --------------------------------------------------


async def get_platform_settings(db: AsyncSession) -> PlatformSettings | None:
    result = await db.execute(select(PlatformSettings).limit(1))
    return result.scalars().first()


async def add_platform_settings(db: AsyncSession, settings: PlatformSettings) -> PlatformSettings:
    db.add(settings)
    await db.flush()
    return settings
