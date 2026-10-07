"""Read-only aggregates for the admin Dashboard (the prototype's Overview).

One function, ``build_overview``, answers every card on the page with a fixed
number of aggregate queries, whatever the data size:

1. registered players (total) and new sign-ups per day over both periods
2. bookings per day over both periods: count of live bookings (pending,
   confirmed, completed), and value of confirmed or completed bookings
3. arena counts by status and active flag (live / pending), for the selected city
4. bookings by city in the current period
5. slot utilisation by start hour in the current period (live arenas,
   available courts, maintenance slots left out)
6. top arenas by booking value in the current period
7. decision queue (network-wide): pending arenas and open complaints, with
   the oldest of each

"Current period" is the last 30 days ending today, or the current calendar
quarter; the "previous period" is the same length immediately before it.
Days are Asia/Karachi days (app.shared.timezone): created_at columns are
naive wall-clock times written in the database session's zone, so each one
is read in that zone and converted to Karachi before it is bucketed.
Deltas are omitted (None) when the previous period has nothing to compare
against. Nothing here writes.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import Date, case, cast, extract, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.schema import (
    CityShare,
    DashboardOverview,
    DayPoint,
    HourPoint,
    OverviewKpi,
    OverviewKpis,
    OverviewPeriod,
    PeakWindow,
    QueueSummary,
    TopArena,
)
from app.modules.arena.model import Arena, ArenaCity, ArenaStatus
from app.modules.booking.model import Booking, BookingStatus
from app.modules.complaint.model import Complaint, ComplaintStatus
from app.modules.court.model import Court
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User, UserRole
from app.shared.timezone import PLATFORM_TZ_NAME, platform_today

OverviewRange = Literal["30d", "quarter"]

# Bookings that count toward volume: live ones. Cancelled and rejected
# bookings never happened, so they are left out of every count.
_COUNTED_STATUSES = (
    BookingStatus.pending_payment,
    BookingStatus.pending_approval,
    BookingStatus.confirmed,
    BookingStatus.completed,
)
# Bookings that count toward value: money the arena is actually getting.
_VALUE_STATUSES = (BookingStatus.confirmed, BookingStatus.completed)
# Slots that count as used for utilisation.
_USED_SLOTS = (SlotStatus.booked, SlotStatus.reserved)
_PEAK_WIDTH = 3  # hours in the peak window


def _periods(today: date, range_: OverviewRange) -> tuple[date, date, date, date]:
    """(start, end, previous_start, previous_end); end dates are inclusive."""
    if range_ == "quarter":
        q_month = 3 * ((today.month - 1) // 3) + 1
        start = date(today.year, q_month, 1)
    else:
        start = today - timedelta(days=29)
    days = (today - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return start, today, prev_start, prev_end


def _delta(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _karachi(column):
    """A naive timestamp column (written in the session's zone) as a naive
    Asia/Karachi wall-clock time."""
    session_zone = func.current_setting("TimeZone")
    return func.timezone(literal(PLATFORM_TZ_NAME), func.timezone(session_zone, column))


def _day_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


async def build_overview(
    db: AsyncSession,
    *,
    city: ArenaCity | None,
    range_: OverviewRange,
    today: date | None = None,
) -> DashboardOverview:
    today = today or platform_today()
    start, end, prev_start, prev_end = _periods(today, range_)
    window_start = datetime.combine(prev_start, time.min)
    window_end = datetime.combine(end + timedelta(days=1), time.min)
    city_filter = [Arena.city == city] if city else []

    # 1. players: total, and sign-ups per day over both periods ------------
    players_total = await db.scalar(
        select(func.count()).where(User.role == UserRole.player, User.deleted_at.is_(None))
    )
    signup_at = _karachi(User.created_at)
    signup_day = cast(signup_at, Date)
    signups = dict(
        (
            await db.execute(
                select(signup_day, func.count())
                .where(
                    User.role == UserRole.player,
                    User.deleted_at.is_(None),
                    signup_at >= window_start,
                    signup_at < window_end,
                )
                .group_by(signup_day)
            )
        ).all()
    )

    # 2. bookings per day over both periods: live count and confirmed value
    booked_at = _karachi(Booking.created_at)
    booking_day = cast(booked_at, Date)
    value = func.coalesce(
        func.sum(case((Booking.status.in_(_VALUE_STATUSES), Booking.total_amount), else_=0)), 0
    )
    rows = (
        await db.execute(
            select(booking_day, func.count(), value)
            .select_from(Booking)
            .join(Arena, Arena.id == Booking.arena_id)
            .where(
                booked_at >= window_start,
                booked_at < window_end,
                Booking.status.in_(_COUNTED_STATUSES),
                *city_filter,
            )
            .group_by(booking_day)
        )
    ).all()
    by_day = {d: (int(n), Decimal(v)) for d, n, v in rows}

    # 3. arenas by status. Live = approved and active; pending counts every
    #    pending arena, exactly as the Approvals queue lists them. -------------
    arena_rows = (
        await db.execute(
            select(Arena.status, Arena.is_active, func.count())
            .where(*city_filter)
            .group_by(Arena.status, Arena.is_active)
        )
    ).all()
    live_arenas = sum(int(n) for s, active, n in arena_rows if s == ArenaStatus.approved and active)
    pending_arenas = sum(int(n) for s, _active, n in arena_rows if s == ArenaStatus.pending)

    # 4. bookings by city in the current period ----------------------------
    cur_start = datetime.combine(start, time.min)
    city_rows = (
        await db.execute(
            select(Arena.city, func.count())
            .select_from(Booking)
            .join(Arena, Arena.id == Booking.arena_id)
            .where(
                booked_at >= cur_start,
                booked_at < window_end,
                Booking.status.in_(_COUNTED_STATUSES),
                *city_filter,
            )
            .group_by(Arena.city)
            .order_by(func.count().desc())
        )
    ).all()

    # 5. slot utilisation by start hour in the current period: slots of live
    #    (approved, active) arenas and available courts; maintenance slots are
    #    not bookable, so they are out of the total too. ----------------------
    hour = extract("hour", TimeSlot.start_time)
    used = func.sum(case((TimeSlot.status.in_(_USED_SLOTS), 1), else_=0))
    hour_rows = (
        await db.execute(
            select(hour, used, func.count())
            .select_from(TimeSlot)
            .join(Court, Court.id == TimeSlot.court_id)
            .join(Arena, Arena.id == Court.arena_id)
            .where(
                TimeSlot.date >= start,
                TimeSlot.date <= end,
                TimeSlot.status != SlotStatus.maintenance,
                Arena.status == ArenaStatus.approved,
                Arena.is_active.is_(True),
                Court.is_available.is_(True),
                *city_filter,
            )
            .group_by(hour)
            .order_by(hour)
        )
    ).all()

    # 6. top arenas by confirmed booking value in the current period -------
    arena_value = func.coalesce(
        func.sum(case((Booking.status.in_(_VALUE_STATUSES), Booking.total_amount), else_=0)), 0
    )
    top_rows = (
        await db.execute(
            select(Arena.id, Arena.name, Arena.city, func.count(Booking.id), arena_value)
            .select_from(Arena)
            .join(Booking, Booking.arena_id == Arena.id)
            .where(
                booked_at >= cur_start,
                booked_at < window_end,
                Booking.status.in_(_COUNTED_STATUSES),
                *city_filter,
            )
            .group_by(Arena.id, Arena.name, Arena.city)
            .order_by(arena_value.desc(), func.count(Booking.id).desc())
            .limit(5)
        )
    ).all()

    # 7. decision queue: network-wide whatever the city filter, because these
    #    are decisions an admin owes; the counts match the Approvals "pending"
    #    list and the Complaints "open" list the queue links to. -------------
    queue_arena_row = (
        await db.execute(
            select(func.count(), func.min(Arena.created_at)).where(
                Arena.status == ArenaStatus.pending
            )
        )
    ).one()
    complaint_row = (
        await db.execute(
            select(func.count(), func.min(Complaint.created_at)).where(
                Complaint.status == ComplaintStatus.open
            )
        )
    ).one()

    # ---- assemble ------------------------------------------------------------
    cur_days = _day_range(start, end)
    prev_days = _day_range(prev_start, prev_end)

    def booking_count(d: date) -> int:
        return by_day.get(d, (0, Decimal(0)))[0]

    def booking_value(d: date) -> Decimal:
        return by_day.get(d, (0, Decimal(0)))[1]

    cur_bookings = sum(booking_count(d) for d in cur_days)
    prev_bookings = sum(booking_count(d) for d in prev_days)
    cur_value = sum((booking_value(d) for d in cur_days), Decimal(0))
    prev_value = sum((booking_value(d) for d in prev_days), Decimal(0))
    cur_signups = sum(int(signups.get(d, 0)) for d in cur_days)
    prev_signups = sum(int(signups.get(d, 0)) for d in prev_days)

    kpis = OverviewKpis(
        players=OverviewKpi(
            value=float(players_total or 0),
            delta_pct=_delta(cur_signups, prev_signups),
            series=[float(signups.get(d, 0)) for d in cur_days],
            extra=cur_signups,
        ),
        bookings=OverviewKpi(
            value=float(cur_bookings),
            delta_pct=_delta(cur_bookings, prev_bookings),
            series=[float(booking_count(d)) for d in cur_days],
            extra=booking_count(end),
        ),
        gross_value=OverviewKpi(
            value=float(cur_value),
            delta_pct=_delta(float(cur_value), float(prev_value)),
            series=[float(booking_value(d)) for d in cur_days],
            extra=None,
        ),
        live_arenas=OverviewKpi(
            value=float(live_arenas),
            # No approval timestamp is stored, so there is no honest previous
            # value to compare with: the delta and series are left out.
            delta_pct=None,
            series=[],
            extra=pending_arenas,
        ),
    )

    hours = [
        HourPoint(
            hour=int(h),
            used=int(u or 0),
            total=int(t),
            pct=round(int(u or 0) / int(t) * 100, 1) if t else 0.0,
        )
        for h, u, t in hour_rows
    ]
    peak: PeakWindow | None = None
    if len(hours) >= _PEAK_WIDTH and any(p.used for p in hours):
        best = max(
            range(len(hours) - _PEAK_WIDTH + 1),
            key=lambda i: sum(p.used for p in hours[i : i + _PEAK_WIDTH]),
        )
        peak = PeakWindow(
            start_hour=hours[best].hour, end_hour=hours[best + _PEAK_WIDTH - 1].hour + 1
        )

    total_city = sum(int(n) for _, n in city_rows)
    return DashboardOverview(
        period=OverviewPeriod(
            start=start, end=end, previous_start=prev_start, previous_end=prev_end, range=range_
        ),
        city=city.value if city else None,
        kpis=kpis,
        bookings_by_day=[DayPoint(date=d, value=booking_count(d)) for d in cur_days],
        previous_bookings_by_day=[DayPoint(date=d, value=booking_count(d)) for d in prev_days],
        by_city=[
            CityShare(
                city=c.value if hasattr(c, "value") else str(c),
                bookings=int(n),
                share_pct=round(int(n) / total_city * 100, 1) if total_city else 0.0,
            )
            for c, n in city_rows
        ],
        utilisation_by_hour=hours,
        peak_window=peak,
        top_arenas=[
            TopArena(
                arena_id=a_id,
                name=name,
                city=c.value if hasattr(c, "value") else str(c),
                bookings=int(n),
                value=float(v),
            )
            for a_id, name, c, n, v in top_rows
        ],
        queue=QueueSummary(
            pending_arenas=int(queue_arena_row[0] or 0),
            open_complaints=int(complaint_row[0] or 0),
            oldest_waiting_at=min(
                (t for t in (queue_arena_row[1], complaint_row[1]) if t is not None), default=None
            ),
        ),
    )
