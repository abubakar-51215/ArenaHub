"""Read endpoints the admin phone screens need, on top of the existing admin routes:

* ``GET /admin/phone/overview`` - the Overview numbers and the tab badges;
* ``GET /admin/arena-cards`` - arenas with their owner, by scope (waiting, approved, rejected, live,
  suspended);
* ``GET /admin/arenas/{id}/summary`` - one arena for the detail screen, with the number of upcoming
  bookings a suspension would cancel.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.arena.model import Arena, ArenaStatus
from app.modules.booking.model import Booking, BookingStatus
from app.modules.complaint.model import Complaint, ComplaintStatus
from app.modules.court.model import Court
from app.modules.payment.model import Refund, RefundStatus
from app.modules.review.model import Review
from app.modules.user.model import User
from app.shared.pagination import PaginationParams, paginated

ArenaScope = Literal["waiting", "approved", "rejected", "live", "suspended", "all"]

_UPCOMING = (BookingStatus.confirmed, BookingStatus.pending_payment, BookingStatus.pending_approval)


class PhoneOverview(BaseModel):
    pending_arenas: int
    oldest_pending_arena_name: str | None
    oldest_pending_arena_at: datetime | None
    open_complaints: int
    oldest_open_complaint_at: datetime | None
    bookings_today: int
    refunds_waiting: int
    refunds_waiting_amount: Decimal


class AdminArenaCard(BaseModel):
    id: uuid.UUID
    name: str
    city: str
    area: str | None
    status: ArenaStatus
    is_suspended: bool
    sports_offered: list
    owner_name: str
    created_at: datetime


class AdminArenaSummary(AdminArenaCard):
    description: str | None
    address: str
    images: list
    owner_email: str
    courts: int
    min_price: Decimal | None
    avg_rating: float | None
    review_count: int
    upcoming_bookings: int
    rejection_reason: str | None
    suspended_at: datetime | None
    suspended_reason: str | None


async def overview(db: AsyncSession, today: date | None = None) -> PhoneOverview:
    today = today or date.today()
    live = Arena.deleted_at.is_(None)
    pending = (Arena.status == ArenaStatus.pending, live)
    pending_n = await db.scalar(select(func.count()).select_from(Arena).where(*pending)) or 0
    oldest = (
        await db.execute(
            select(Arena.name, Arena.created_at).where(*pending).order_by(Arena.created_at).limit(1)
        )
    ).first()
    open_c = Complaint.status == ComplaintStatus.open
    open_n = await db.scalar(select(func.count()).select_from(Complaint).where(open_c)) or 0
    oldest_c = await db.scalar(select(func.min(Complaint.created_at)).where(open_c))
    bookings_today = (
        await db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.booking_date == today,
                Booking.status.in_((BookingStatus.confirmed, BookingStatus.completed)),
            )
        )
        or 0
    )
    refund_n, refund_sum = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(Refund.amount), 0)).where(
                Refund.status == RefundStatus.pending
            )
        )
    ).one()
    return PhoneOverview(
        pending_arenas=pending_n,
        oldest_pending_arena_name=oldest[0] if oldest else None,
        oldest_pending_arena_at=oldest[1] if oldest else None,
        open_complaints=open_n,
        oldest_open_complaint_at=oldest_c,
        bookings_today=bookings_today,
        refunds_waiting=refund_n,
        refunds_waiting_amount=Decimal(refund_sum),
    )


def _card(a: Arena, owner: User) -> AdminArenaCard:
    return AdminArenaCard(
        id=a.id,
        name=a.name,
        city=a.city.value if hasattr(a.city, "value") else str(a.city),
        area=a.area,
        status=a.status,
        is_suspended=a.is_suspended,
        sports_offered=list(a.sports_offered or []),
        owner_name=owner.full_name,
        created_at=a.created_at,
    )


async def arena_cards(
    db: AsyncSession, scope: ArenaScope, search: str | None, params: PaginationParams
) -> dict:
    base = (
        select(Arena, User).join(User, User.id == Arena.owner_id).where(Arena.deleted_at.is_(None))
    )
    if scope == "waiting":
        base = base.where(Arena.status == ArenaStatus.pending)
    elif scope == "approved":
        base = base.where(Arena.status == ArenaStatus.approved)
    elif scope == "rejected":
        base = base.where(Arena.status == ArenaStatus.rejected)
    elif scope == "live":
        base = base.where(Arena.status == ArenaStatus.approved, Arena.suspended_at.is_(None))
    elif scope == "suspended":
        base = base.where(Arena.suspended_at.is_not(None))
    if search and search.strip():
        like = f"%{search.strip()}%"
        base = base.where(
            or_(Arena.name.ilike(like), Arena.area.ilike(like), User.full_name.ilike(like))
        )
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    # waiting: longest wait first; everything else: newest first
    order = Arena.created_at.asc() if scope == "waiting" else Arena.created_at.desc()
    rows = (
        await db.execute(base.order_by(order).offset(params.offset).limit(params.page_size))
    ).all()
    return paginated([_card(a, o) for a, o in rows], total, params)


async def arena_summary(
    db: AsyncSession, arena_id: uuid.UUID, now: datetime | None = None
) -> AdminArenaSummary:
    row = (
        await db.execute(
            select(Arena, User).join(User, User.id == Arena.owner_id).where(Arena.id == arena_id)
        )
    ).first()
    if row is None or row[0].deleted_at is not None:
        raise NotFoundError("Arena not found.")
    arena, owner = row
    now = now or datetime.now()
    courts = (
        await db.scalar(select(func.count()).select_from(Court).where(Court.arena_id == arena_id))
        or 0
    )
    min_price = await db.scalar(
        select(func.min(Court.base_price)).where(Court.arena_id == arena_id)
    )
    rating, reviews = (
        await db.execute(
            select(func.avg(Review.rating), func.count()).where(Review.arena_id == arena_id)
        )
    ).one()
    # the bookings a suspension would cancel: not started yet, still live
    upcoming = (
        await db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.arena_id == arena_id,
                Booking.status.in_(_UPCOMING),
                (Booking.booking_date > now.date())
                | ((Booking.booking_date == now.date()) & (Booking.start_time > now.time())),
            )
        )
        or 0
    )
    card = _card(arena, owner)
    return AdminArenaSummary(
        **card.model_dump(),
        description=arena.description,
        address=arena.address,
        images=list(arena.images or []),
        owner_email=owner.email,
        courts=courts,
        min_price=min_price,
        avg_rating=float(rating) if rating is not None else None,
        review_count=reviews or 0,
        upcoming_bookings=upcoming,
        rejection_reason=arena.rejection_reason,
        suspended_at=arena.suspended_at,
        suspended_reason=arena.suspended_reason,
    )
