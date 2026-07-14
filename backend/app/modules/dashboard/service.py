"""Owner dashboard business logic: summary widgets, a cross-arena
booking-approval queue, a per-arena calendar, and revenue/earnings widgets
(docs/07_ARENA_OWNER_MODULE.md sections 3, 8, 9, 11).

The booking-approval *action* itself (approve/reject a bank_transfer
receipt) already exists in ``payment.service`` — this module only adds the
read-side queue view across all of an owner's arenas at once, which nothing
else exposes (``booking.service.list_arena_bookings`` is scoped to one
arena).
"""

import calendar
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import Arena, ArenaCity
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import Booking, BookingStatus
from app.modules.dashboard.schema import (
    BookingsByHourPoint,
    CalendarBookingResponse,
    DashboardAnalyticsResponse,
    DashboardSummaryResponse,
    OwnerBookingRow,
    PeakHours,
    PendingApprovalItem,
    RecentBookingItem,
    RevenueBreakdownItem,
    RevenueSummaryResponse,
    RevenueTrendPoint,
    TopArenaItem,
)
from app.modules.payment import repository as payment_repo
from app.modules.slot import repository as slot_repo
from app.modules.user.model import User
from app.shared.pagination import PaginationParams, paginated


def _month_bounds(today: date) -> tuple[date, date]:
    last_day = calendar.monthrange(today.year, today.month)[1]
    return today.replace(day=1), today.replace(day=last_day)


async def get_summary(db: AsyncSession, user: User) -> DashboardSummaryResponse:
    arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)
    today = date.today()
    month_start, month_end = _month_bounds(today)

    bookings_today = await booking_repo.count_on_date_for_arenas(db, arena_ids, today)
    bookings_this_month = await booking_repo.count_in_range_for_arenas(
        db, arena_ids, month_start, month_end
    )
    monthly_revenue = await payment_repo.sum_revenue_for_arenas(
        db,
        arena_ids,
        date_from=datetime.combine(month_start, time.min),
        date_to=datetime.combine(month_end, time.max),
    )
    pending_approvals = await booking_repo.count_by_status_for_arenas(
        db, arena_ids, BookingStatus.pending_approval
    )

    return DashboardSummaryResponse(
        total_arenas=len(arena_ids),
        bookings_today=bookings_today,
        bookings_this_month=bookings_this_month,
        monthly_revenue=monthly_revenue,
        pending_approvals=pending_approvals,
    )


async def list_pending_approvals(db: AsyncSession, user: User, params: PaginationParams) -> dict:
    arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)
    bookings, total = await booking_repo.list_pending_approval_for_arenas(
        db, arena_ids, offset=params.offset, limit=params.page_size
    )

    arena_rows = [await arena_repo.get_arena(db, aid) for aid in arena_ids]
    arenas = {a.id: a for a in arena_rows if a is not None}
    player_ids = {b.player_id for b in bookings}
    players = {}
    if player_ids:
        result = await db.execute(select(User).where(User.id.in_(player_ids)))
        players = {u.id: u for u in result.scalars().all()}
    payments_by_group = {}
    for booking in bookings:
        if booking.booking_group_id not in payments_by_group:
            payments_by_group[booking.booking_group_id] = await payment_repo.get_payment_by_group(
                db, booking.booking_group_id
            )

    items = []
    for booking in bookings:
        arena = arenas.get(booking.arena_id)
        player = players.get(booking.player_id)
        payment = payments_by_group.get(booking.booking_group_id)
        items.append(
            PendingApprovalItem(
                booking_id=booking.id,
                arena_id=booking.arena_id,
                arena_name=arena.name if arena else "",
                court_id=booking.court_id,
                player_id=booking.player_id,
                player_name=player.full_name if player else "",
                booking_date=booking.booking_date,
                start_time=booking.start_time,
                end_time=booking.end_time,
                total_amount=booking.total_amount,
                payment_id=payment.id if payment else None,
                payment_method=payment.payment_method.value if payment else None,
                receipt_proof_url=payment.receipt_proof_url if payment else None,
            )
        )
    return paginated(items, total, params)


async def _owned_arena(db: AsyncSession, arena_id: uuid.UUID, user: User) -> Arena:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    return arena


async def get_calendar(
    db: AsyncSession, user: User, arena_id: uuid.UUID, start: date, end: date
) -> list[CalendarBookingResponse]:
    await _owned_arena(db, arena_id, user)
    rows: list[Booking] = await booking_repo.list_arena_bookings_in_range(db, arena_id, start, end)
    return [CalendarBookingResponse.model_validate(r) for r in rows]


async def get_revenue(
    db: AsyncSession,
    user: User,
    *,
    date_from: date | None,
    date_to: date | None,
    arena_id: uuid.UUID | None,
) -> RevenueSummaryResponse:
    if arena_id is not None:
        await _owned_arena(db, arena_id, user)
        arena_ids = [arena_id]
    else:
        arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)

    dt_from = datetime.combine(date_from, time.min) if date_from else None
    dt_to = datetime.combine(date_to, time.max) if date_to else None

    total = await payment_repo.sum_revenue_for_arenas(
        db, arena_ids, date_from=dt_from, date_to=dt_to
    )
    pending_settlements = await booking_repo.sum_pending_settlement_for_arenas(db, arena_ids)
    by_arena = await payment_repo.revenue_by_arena(db, arena_ids, date_from=dt_from, date_to=dt_to)
    by_court = await payment_repo.revenue_by_court(db, arena_ids, date_from=dt_from, date_to=dt_to)

    return RevenueSummaryResponse(
        total_revenue=total,
        pending_settlements=pending_settlements,
        breakdown_by_arena=[RevenueBreakdownItem(id=aid, amount=amt) for aid, amt in by_arena],
        breakdown_by_court=[RevenueBreakdownItem(id=cid, amount=amt) for cid, amt in by_court],
    )


def _change_pct(current: Decimal | int, previous: Decimal | int) -> float | None:
    """Relative change vs the preceding period; None when there is no baseline."""
    if not previous:
        return None
    return round((float(current) - float(previous)) / float(previous) * 100, 1)


def _peak_window(by_hour: dict[int, int]) -> PeakHours | None:
    """The consecutive 3-hour window with the most bookings ("7 PM – 10 PM")."""
    if not by_hour:
        return None
    best_start, best_total = 0, -1
    for start in range(0, 22):
        window_total = sum(by_hour.get(h, 0) for h in range(start, start + 3))
        if window_total > best_total:
            best_start, best_total = start, window_total
    if best_total <= 0:
        return None
    return PeakHours(start_hour=best_start, end_hour=best_start + 3)


async def get_analytics(
    db: AsyncSession,
    user: User,
    *,
    date_from: date,
    date_to: date,
    city: ArenaCity | None,
    arena_id: uuid.UUID | None,
) -> DashboardAnalyticsResponse:
    if arena_id is not None:
        await _owned_arena(db, arena_id, user)
        arena_ids = [arena_id]
    else:
        arena_ids = await arena_repo.list_owner_arena_ids(db, user.id, city=city)

    dt_from = datetime.combine(date_from, time.min)
    dt_to = datetime.combine(date_to, time.max)
    period_days = (date_to - date_from).days + 1
    prev_from = date_from - timedelta(days=period_days)
    prev_to = date_from - timedelta(days=1)

    revenue = await payment_repo.sum_revenue_for_arenas(
        db, arena_ids, date_from=dt_from, date_to=dt_to
    )
    prev_revenue = await payment_repo.sum_revenue_for_arenas(
        db,
        arena_ids,
        date_from=datetime.combine(prev_from, time.min),
        date_to=datetime.combine(prev_to, time.max),
    )
    bookings = await booking_repo.count_in_range_for_arenas(db, arena_ids, date_from, date_to)
    prev_bookings = await booking_repo.count_in_range_for_arenas(db, arena_ids, prev_from, prev_to)

    total_slots, booked_slots = await slot_repo.occupancy_counts(
        db, arena_ids, date_from=date_from, date_to=date_to
    )
    occupancy = round(booked_slots / total_slots * 100, 1) if total_slots else None
    prev_total, prev_booked = await slot_repo.occupancy_counts(
        db, arena_ids, date_from=prev_from, date_to=prev_to
    )
    prev_occupancy = round(prev_booked / prev_total * 100, 1) if prev_total else None
    occupancy_change = (
        round(occupancy - prev_occupancy, 1)
        if occupancy is not None and prev_occupancy is not None
        else None
    )

    by_day = dict(
        await payment_repo.revenue_by_day(db, arena_ids, date_from=dt_from, date_to=dt_to)
    )
    trend = [
        RevenueTrendPoint(
            date=date_from + timedelta(days=i),
            amount=by_day.get(date_from + timedelta(days=i), Decimal("0")),
        )
        for i in range(period_days)
    ]

    by_hour = dict(await booking_repo.bookings_by_hour(db, arena_ids, date_from, date_to))
    bookings_by_time = [BookingsByHourPoint(hour=h, count=by_hour.get(h, 0)) for h in range(24)]

    revenue_per_arena = await payment_repo.revenue_by_arena(
        db, arena_ids, date_from=dt_from, date_to=dt_to
    )
    top: list[TopArenaItem] = []
    for aid, amount in sorted(revenue_per_arena, key=lambda pair: pair[1], reverse=True)[:5]:
        arena = await arena_repo.get_arena(db, aid)
        top.append(TopArenaItem(arena_id=aid, name=arena.name if arena else "", revenue=amount))

    recent = [
        RecentBookingItem(
            booking_id=booking.id,
            booking_date=booking.booking_date,
            start_time=booking.start_time,
            end_time=booking.end_time,
            court_name=court_name,
            arena_name=arena_name,
            status=booking.status,
        )
        for booking, court_name, arena_name in await booking_repo.list_recent_bookings_with_names(
            db, arena_ids, limit=5
        )
    ]

    return DashboardAnalyticsResponse(
        total_revenue=revenue,
        revenue_change_pct=_change_pct(revenue, prev_revenue),
        total_bookings=bookings,
        bookings_change_pct=_change_pct(bookings, prev_bookings),
        peak_hours=_peak_window(by_hour),
        occupancy_rate=occupancy,
        occupancy_change_pts=occupancy_change,
        revenue_trend=trend,
        bookings_by_time=bookings_by_time,
        top_arenas=top,
        recent_bookings=recent,
    )


async def list_owner_bookings(
    db: AsyncSession,
    user: User,
    *,
    arena_id: uuid.UUID | None,
    court_id: uuid.UUID | None,
    status: BookingStatus | None,
    date_from: date | None,
    date_to: date | None,
    params: PaginationParams,
) -> dict:
    """The booking-management table (wireframe screen 5): every booking across
    the owner's arenas with names resolved, filterable."""
    if arena_id is not None:
        await _owned_arena(db, arena_id, user)
        arena_ids = [arena_id]
    else:
        arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)

    rows, total = await booking_repo.list_owner_bookings_with_names(
        db,
        arena_ids,
        court_id=court_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        offset=params.offset,
        limit=params.page_size,
    )

    payments_by_group = {}
    for booking, _, _, _ in rows:
        if booking.booking_group_id not in payments_by_group:
            payments_by_group[booking.booking_group_id] = await payment_repo.get_payment_by_group(
                db, booking.booking_group_id
            )

    items = []
    for booking, court_name, arena_name, player_name in rows:
        payment = payments_by_group.get(booking.booking_group_id)
        items.append(
            OwnerBookingRow(
                booking_id=booking.id,
                booking_date=booking.booking_date,
                start_time=booking.start_time,
                end_time=booking.end_time,
                arena_id=booking.arena_id,
                arena_name=arena_name,
                court_id=booking.court_id,
                court_name=court_name,
                player_name=player_name,
                total_amount=booking.total_amount,
                status=booking.status,
                payment_id=payment.id if payment else None,
                receipt_proof_url=payment.receipt_proof_url if payment else None,
            )
        )
    return paginated(items, total, params)
