"""Admin business logic.

Verification (arena approve/reject) is a thin slice over the arena
repository/state-machine — see the module docstring history. Everything
added for Sprint 5 (user management, platform-wide monitoring, dashboard
metrics, audit log) is read/administrative logic that doesn't belong to any
single feature module, so it lives here instead.
"""

import secrets
import uuid
from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.admin import repository as repo
from app.modules.admin.model import AuditLog, PlatformSettings
from app.modules.admin.schema import (
    AdminBookingResponse,
    AdminPaymentResponse,
    AdminUserDetailResponse,
    AdminUserResponse,
    AuditLogResponse,
    DashboardMetrics,
    PlatformSettingsRequest,
    PlatformSettingsResponse,
)
from app.modules.arena import repository as arena_repo
from app.modules.arena import service as arena_service
from app.modules.arena.model import ArenaStatus
from app.modules.arena.schema import ArenaResponse
from app.modules.auth import tokens
from app.modules.booking.model import BookingStatus
from app.modules.complaint import service as complaint_service
from app.modules.payment.model import PaymentMethod
from app.modules.payment.model import PaymentStatus as PayStatus
from app.modules.user.model import User, UserRole
from app.shared.pagination import PaginationParams, paginated


async def record_audit(
    db: AsyncSession,
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
) -> None:
    await repo.add_audit_log(
        db,
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details or {},
        ),
    )


# ---- arena verification (existing) --------------------------------------------------


async def list_queue(db: AsyncSession, status: ArenaStatus, params: PaginationParams) -> dict:
    arenas, total = await arena_repo.list_arenas_by_status(
        db, status, offset=params.offset, limit=params.page_size
    )
    items = [ArenaResponse.model_validate(a) for a in arenas]
    return paginated(items, total, params)


async def get_arena(db: AsyncSession, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    return ArenaResponse.model_validate(arena)


async def approve_arena(db: AsyncSession, actor: User, arena_id: uuid.UUID) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    await arena_service.set_status(db, arena, ArenaStatus.approved)
    await record_audit(db, actor, "arena.approve", "arena", str(arena_id))
    await db.commit()
    refreshed = await arena_repo.get_arena(db, arena_id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)


async def reject_arena(
    db: AsyncSession, actor: User, arena_id: uuid.UUID, reason: str
) -> ArenaResponse:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    await arena_service.set_status(db, arena, ArenaStatus.rejected, reason=reason)
    await record_audit(db, actor, "arena.reject", "arena", str(arena_id), {"reason": reason})
    await db.commit()
    refreshed = await arena_repo.get_arena(db, arena_id)
    assert refreshed is not None
    return ArenaResponse.model_validate(refreshed)


# ---- user management --------------------------------------------------


async def list_users(
    db: AsyncSession,
    *,
    role: UserRole | None,
    is_active: bool | None,
    search: str | None,
    params: PaginationParams,
) -> dict:
    users, total = await repo.list_users(
        db,
        role=role,
        is_active=is_active,
        search=search,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [AdminUserResponse.model_validate(u) for u in users]
    return paginated(items, total, params)


async def get_user_detail(db: AsyncSession, user_id: uuid.UUID) -> AdminUserDetailResponse:
    user = await repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    total_bookings = await repo.count_user_bookings(db, user_id)
    return AdminUserDetailResponse(
        **AdminUserResponse.model_validate(user).model_dump(), total_bookings=total_bookings
    )


async def suspend_user(
    db: AsyncSession, actor: User, user_id: uuid.UUID, reason: str
) -> AdminUserResponse:
    user = await repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    user.is_active = False
    await record_audit(db, actor, "user.suspend", "user", str(user_id), {"reason": reason})
    await db.commit()
    refreshed = await repo.get_user(db, user_id)
    assert refreshed is not None
    return AdminUserResponse.model_validate(refreshed)


async def delete_user(db: AsyncSession, actor: User, user_id: uuid.UUID) -> None:
    """Admin-facing "delete": scrub PII, deactivate, and lock the account out
    of login — but keep the row so bookings/payments/refunds/reviews/audit
    logs (which FK to it) stay intact. To anyone using the product this
    reads as a real delete: the account disappears from the active user
    list, can no longer sign in, and its profile is gone."""
    user = await repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    if user.deleted_at is not None:
        raise ValidationError("This user is already deleted.")
    if user.role == UserRole.admin:
        raise ForbiddenError("Admin accounts cannot be deleted.")

    suffix = secrets.token_hex(8)  # 16 hex chars, plenty of entropy for email
    user.deleted_at = datetime.now()
    user.is_active = False
    user.full_name = "Deleted User"
    user.email = f"deleted-{suffix}@arenahub.local"
    # phone is String(20): "del-" (4) + 16 hex chars = 20 exactly.
    user.phone = f"del-{suffix}"
    user.profile_picture = None
    user.bio = None

    await record_audit(db, actor, "user.delete", "user", str(user_id))
    await db.commit()
    await tokens.bump_session_epoch(str(user_id))


async def reactivate_user(db: AsyncSession, actor: User, user_id: uuid.UUID) -> AdminUserResponse:
    user = await repo.get_user(db, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    user.is_active = True
    await record_audit(db, actor, "user.reactivate", "user", str(user_id))
    await db.commit()
    refreshed = await repo.get_user(db, user_id)
    assert refreshed is not None
    return AdminUserResponse.model_validate(refreshed)


# ---- platform-wide monitoring --------------------------------------------------


async def list_bookings(
    db: AsyncSession,
    *,
    status: BookingStatus | None,
    arena_id: uuid.UUID | None,
    player_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
    params: PaginationParams,
) -> dict:
    rows, total = await repo.list_all_bookings(
        db,
        status=status,
        arena_id=arena_id,
        player_id=player_id,
        date_from=date_from,
        date_to=date_to,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [
        AdminBookingResponse(
            id=b.id,
            player_id=b.player_id,
            player_name=pn,
            arena_id=b.arena_id,
            arena_name=an,
            court_name=cn,
            booking_date=b.booking_date,
            start_time=b.start_time,
            end_time=b.end_time,
            total_amount=b.total_amount,
            payment_type=b.payment_type,
            status=b.status,
            created_at=b.created_at,
        )
        for b, an, cn, pn in rows
    ]
    return paginated(items, total, params)


async def list_payments(
    db: AsyncSession,
    *,
    status: PayStatus | None,
    method: PaymentMethod | None,
    arena_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    params: PaginationParams,
) -> dict:
    rows, total = await repo.list_all_payments(
        db,
        status=status,
        method=method,
        arena_id=arena_id,
        date_from=date_from,
        date_to=date_to,
        offset=params.offset,
        limit=params.page_size,
    )
    items = [
        AdminPaymentResponse(
            id=p.id,
            player_id=p.player_id,
            player_name=pn,
            arena_name=an,
            amount=p.amount,
            currency=p.currency,
            payment_method=p.payment_method,
            gateway_transaction_id=p.gateway_transaction_id,
            status=p.status,
            created_at=p.created_at,
        )
        for p, an, pn in rows
    ]
    return paginated(items, total, params)


# ---- dashboard --------------------------------------------------


async def get_dashboard_metrics(db: AsyncSession) -> DashboardMetrics:
    now = datetime.now()
    month_start = datetime(now.year, now.month, 1)
    today_start = datetime(now.year, now.month, now.day)

    total_players = await repo.count_users_by_role(db, UserRole.player)
    total_owners = await repo.count_users_by_role(db, UserRole.owner)
    pending_arenas = await repo.count_arenas_by_status(db, ArenaStatus.pending)
    approved_arenas = await repo.count_arenas_by_status(db, ArenaStatus.approved)
    rejected_arenas = await repo.count_arenas_by_status(db, ArenaStatus.rejected)
    bookings_today = await repo.count_bookings_since(db, today_start)
    bookings_this_month = await repo.count_bookings_since(db, month_start)
    bookings_all_time = await repo.count_bookings_since(db, None)
    total_revenue = await repo.sum_platform_revenue(db)
    active_complaints = await complaint_service.count_open(db)

    return DashboardMetrics(
        total_players=total_players,
        total_owners=total_owners,
        total_arenas=pending_arenas + approved_arenas + rejected_arenas,
        pending_arenas=pending_arenas,
        approved_arenas=approved_arenas,
        rejected_arenas=rejected_arenas,
        bookings_today=bookings_today,
        bookings_this_month=bookings_this_month,
        bookings_all_time=bookings_all_time,
        total_revenue=total_revenue,
        active_complaints=active_complaints,
    )


# ---- audit log --------------------------------------------------


async def list_audit_logs(
    db: AsyncSession, *, action: str | None, params: PaginationParams
) -> dict:
    logs, total = await repo.list_audit_logs(
        db, action=action, offset=params.offset, limit=params.page_size
    )
    items = [
        AuditLogResponse(
            id=log.id,
            actor_id=log.actor_id,
            actor_name=log.actor.full_name if log.actor else "",
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            details=log.details,
            created_at=log.created_at,
        )
        for log in logs
    ]
    return paginated(items, total, params)


# ---- platform settings --------------------------------------------------

_DEFAULT_SETTINGS: dict = {
    "site_name": "Arena Hub",
    "site_description": "Sports arena booking and management platform.",
    "site_email": "support@arenahub.pk",
    "site_phone": "",
    "address": "",
    "default_currency": "PKR",
    "timezone": "Asia/Karachi",
}


async def get_platform_settings(db: AsyncSession) -> PlatformSettingsResponse:
    settings = await repo.get_platform_settings(db)
    data = {**_DEFAULT_SETTINGS, **(settings.data if settings else {})}
    return PlatformSettingsResponse(**data)


async def update_platform_settings(
    db: AsyncSession, actor: User, data: PlatformSettingsRequest
) -> PlatformSettingsResponse:
    settings = await repo.get_platform_settings(db)
    if settings is None:
        settings = await repo.add_platform_settings(db, PlatformSettings(data=data.model_dump()))
    else:
        settings.data = data.model_dump()
    await record_audit(db, actor, "settings.update", "platform_settings", str(settings.id))
    await db.commit()
    return PlatformSettingsResponse(**data.model_dump())
