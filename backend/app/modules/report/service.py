"""Report generation: player booking history, owner booking/revenue, and
admin platform-wide (users/bookings/revenue/arenas/system) — each exportable
as CSV or PDF with an optional date range. Nothing here is persisted; every
report is built fresh from the same repositories the dashboards already query.
"""

import uuid
from datetime import date, datetime, time
from typing import Any, Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, NotFoundError
from app.modules.admin import repository as admin_repo
from app.modules.admin.service import _partially_refunded_ids
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaStatus
from app.modules.booking import repository as booking_repo
from app.modules.booking.service import booking_code_for
from app.modules.court import repository as court_repo
from app.modules.report.builders import rows_to_csv, rows_to_pdf
from app.modules.slot import repository as slot_repo
from app.modules.user.model import User, UserRole
from app.shared.display import (
    PAYMENT_METHOD_NAMES,
    karachi_date,
    phone_status,
    rupees,
    time_12h,
    time_range_12h,
    web_date,
    web_rupees,
    web_status,
)

ReportFormat = Literal["csv", "pdf"]
AdminReportType = Literal["users", "bookings", "revenue", "arenas", "system"]
OwnerReportType = Literal["bookings", "payment", "occupancy"]

_LIMIT = 5000  # a report is a bulk export, not a paginated view
# a payment status in words ("completed" reads "Paid" on every screen)
_PAID = {"completed": "paid"}


def _owner_payment(booking: Any, payment: Any) -> str:
    """The payment as the owner Bookings screen writes it ("Bank transfer · paid")."""
    if payment is None:
        return "Not paid yet" if booking.status.value == "pending_payment" else "-"
    method = PAYMENT_METHOD_NAMES.get(payment.payment_method.value, payment.payment_method.value)
    lifecycle = getattr(getattr(payment, "lifecycle_status", None), "value", None)
    if payment.status.value == "refunded" or lifecycle == "refunded":
        state = "refunded"
    elif payment.status.value == "completed":
        state = "paid"
    elif payment.status.value == "failed":
        state = "failed"
    elif booking.status.value == "pending_approval":
        state = "receipt to review"
    else:
        state = "pending"
    return f"{method} · {state}"


def _render(title: str, headers: list[str], rows: list[list[str]], fmt: ReportFormat) -> bytes:
    if fmt == "csv":
        return rows_to_csv(headers, rows)
    return rows_to_pdf(title, headers, rows)


def _filename(prefix: str, fmt: ReportFormat) -> str:
    return f"{prefix}.{fmt}"


def _media_type(fmt: ReportFormat) -> str:
    return "text/csv" if fmt == "csv" else "application/pdf"


async def player_bookings_report(
    db: AsyncSession,
    user: User,
    *,
    date_from: date | None,
    date_to: date | None,
    fmt: ReportFormat,
) -> tuple[bytes, str, str]:
    bookings, _ = await booking_repo.list_player_bookings(
        db, user.id, status=None, offset=0, limit=_LIMIT
    )
    if date_from is not None:
        bookings = [b for b in bookings if b.booking_date >= date_from]
    if date_to is not None:
        bookings = [b for b in bookings if b.booking_date <= date_to]

    names: dict[tuple[str, uuid.UUID], str] = {}
    for b in bookings:
        if ("a", b.arena_id) not in names:
            arena = await arena_repo.get_arena(db, b.arena_id)
            names[("a", b.arena_id)] = arena.name if arena else ""
        if ("c", b.court_id) not in names:
            court = await court_repo.get_court(db, b.court_id)
            names[("c", b.court_id)] = court.name if court else ""

    # the phone's words: its status tags, its dates ("Wed 14 Oct 2026") and ₨
    headers = ["Booking", "Date", "Time", "Arena", "Court", "Status", "Payment", "Amount"]
    rows = [
        [
            booking_code_for(b.booking_group_id),
            f"{karachi_date(b.booking_date)} {b.booking_date.year}",
            time_range_12h(b.start_time, b.end_time),
            names[("a", b.arena_id)],
            names[("c", b.court_id)],
            phone_status(b.status),
            web_status(_PAID.get(b.payment_status.value, b.payment_status.value)),
            rupees(b.total_amount),
        ]
        for b in bookings
    ]
    return (
        _render("My Bookings", headers, rows, fmt),
        _media_type(fmt),
        _filename("my-bookings", fmt),
    )


async def owner_report(
    db: AsyncSession,
    user: User,
    *,
    report_type: OwnerReportType = "bookings",
    date_from: date | None,
    date_to: date | None,
    arena_id: uuid.UUID | None,
    fmt: ReportFormat,
) -> tuple[bytes, str, str]:
    if arena_id is not None:
        arena = await arena_repo.get_arena(db, arena_id)
        if arena is None:
            raise NotFoundError("Arena not found.")
        if arena.owner_id != user.id:
            raise NotFoundError("Arena not found.")
        arena_ids = [arena_id]
    else:
        arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)

    if report_type == "occupancy":
        headers, rows = await _owner_occupancy_rows(
            db, arena_ids, date_from=date_from, date_to=date_to
        )
        body = _render("Occupancy & Peak Usage", headers, rows, fmt)
        return body, _media_type(fmt), _filename("owner-occupancy-report", fmt)

    if report_type == "payment":
        headers, rows = await _owner_payment_rows(
            db, arena_ids, date_from=date_from, date_to=date_to
        )
        body = _render("Payment Report", headers, rows, fmt)
        return body, _media_type(fmt), _filename("owner-payment-report", fmt)

    rows_raw, _ = await booking_repo.list_owner_bookings_with_names(
        db,
        arena_ids,
        court_id=None,
        status=None,
        date_from=date_from,
        date_to=date_to,
        offset=0,
        limit=_LIMIT,
    )

    # the words, money, dates and times of the owner Bookings screen; the booking code lets an owner
    # match a row to a bank transfer and to the phone
    from app.modules.payment import repository as payment_repo

    payments: dict[uuid.UUID, object] = {}
    for booking, *_ in rows_raw:
        if booking.booking_group_id not in payments:
            payments[booking.booking_group_id] = await payment_repo.get_payment_by_group(
                db, booking.booking_group_id
            )
    headers = ["Booking", "Date", "Time", "Arena", "Court", "Player", "Status", "Payment", "Amount"]
    rows = [
        [
            booking_code_for(booking.booking_group_id),
            web_date(booking.booking_date),
            time_range_12h(booking.start_time, booking.end_time),
            arena_name,
            court_name,
            player_name,
            web_status(booking.status),
            _owner_payment(booking, payments[booking.booking_group_id]),
            web_rupees(booking.total_amount),
        ]
        for booking, court_name, arena_name, player_name in rows_raw
    ]
    body = _render("Owner Bookings & Revenue", headers, rows, fmt)
    return body, _media_type(fmt), _filename("owner-report", fmt)


async def _owner_payment_rows(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: date | None,
    date_to: date | None,
) -> tuple[list[str], list[list[str]]]:
    """One row per payment on the owner's own arenas (FR-O-10's payment report) — the
    booking report is one row per booking, grouped payments collapse to the single row
    the booking screen's own "Payment" line already shows."""
    from app.modules.payment import repository as payment_repo

    rows_raw, _ = await booking_repo.list_owner_bookings_with_names(
        db,
        arena_ids,
        court_id=None,
        status=None,
        date_from=date_from,
        date_to=date_to,
        offset=0,
        limit=_LIMIT,
    )
    seen: set[uuid.UUID] = set()
    headers = ["Date", "Arena", "Player", "Booking", "Method", "Status", "Amount"]
    rows: list[list[str]] = []
    for booking, _court_name, arena_name, player_name in rows_raw:
        if booking.booking_group_id in seen:
            continue
        seen.add(booking.booking_group_id)
        payment = await payment_repo.get_payment_by_group(db, booking.booking_group_id)
        if payment is None:
            continue
        # the first payment, then any balance paid later: each is its own row, once
        for paid in [
            payment,
            *await payment_repo.list_balance_payments_for_group(db, booking.booking_group_id),
        ]:
            rows.append(
                [
                    web_date(paid.created_at),
                    arena_name or "-",
                    player_name,
                    booking_code_for(booking.booking_group_id),
                    PAYMENT_METHOD_NAMES.get(paid.payment_method.value, paid.payment_method.value),
                    web_status(_PAID.get(paid.status.value, paid.status.value)),
                    web_rupees(paid.amount),
                ]
            )
    return headers, rows


async def _owner_occupancy_rows(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: date | None,
    date_to: date | None,
) -> tuple[list[str], list[list[str]]]:
    """Per-court occupancy + peak usage (FR-O-10): sellable vs booked slots
    in the range, and each court's busiest booking hour."""
    per_court = await slot_repo.occupancy_by_court(
        db, arena_ids, date_from=date_from, date_to=date_to
    )
    peaks = await booking_repo.busiest_hour_by_court(db, arena_ids, start=date_from, end=date_to)
    headers = ["Arena", "Court", "Sellable Slots", "Booked", "Occupancy %", "Busiest Hour"]
    rows = []
    for court_id, arena_name, court_name, sellable, booked in per_court:
        pct = f"{(booked / sellable * 100):.1f}%" if sellable else "n/a"
        peak = peaks.get(court_id)
        peak_label = (
            f"{time_12h(f'{peak[0]:02d}:00')} ({peak[1]} booking{'' if peak[1] == 1 else 's'})"
            if peak
            else "-"
        )
        rows.append([arena_name, court_name, str(sellable), str(booked), pct, peak_label])
    return headers, rows


async def _admin_users_rows(db: AsyncSession) -> tuple[list[str], list[list[str]]]:
    users, _ = await admin_repo.list_users(
        db, role=None, is_active=None, search=None, offset=0, limit=_LIMIT
    )
    headers = ["Name", "Email", "Role", "Active", "Verified", "Joined"]
    rows = [
        [
            u.full_name,
            u.email,
            web_status(u.role),
            "Yes" if u.is_active else "No",
            "Yes" if u.is_verified else "No",
            web_date(u.created_at),
        ]
        for u in users
    ]
    return headers, rows


async def _admin_bookings_rows(
    db: AsyncSession, date_from: date | None, date_to: date | None
) -> tuple[list[str], list[list[str]]]:
    rows_raw, _ = await admin_repo.list_all_bookings(
        db,
        status=None,
        arena_id=None,
        player_id=None,
        date_from=date_from,
        date_to=date_to,
        offset=0,
        limit=_LIMIT,
    )
    headers = ["Booking", "Date", "Time", "Arena", "Court", "Player", "Status", "Amount"]
    rows = [
        [
            booking_code_for(booking.booking_group_id),
            web_date(booking.booking_date),
            time_range_12h(booking.start_time, booking.end_time),
            arena_name,
            court_name,
            player_name,
            web_status(booking.status),
            web_rupees(booking.total_amount),
        ]
        for booking, arena_name, court_name, player_name in rows_raw
    ]
    return headers, rows


async def _admin_revenue_rows(
    db: AsyncSession, date_from: date | None, date_to: date | None
) -> tuple[list[str], list[list[str]]]:
    dt_from = datetime.combine(date_from, time.min) if date_from else None
    dt_to = datetime.combine(date_to, time.max) if date_to else None
    payments_raw, _ = await admin_repo.list_all_payments(
        db,
        status=None,
        method=None,
        arena_id=None,
        date_from=dt_from,
        date_to=dt_to,
        offset=0,
        limit=_LIMIT,
    )
    partial = await _partially_refunded_ids(db, [payment.id for payment, *_ in payments_raw])
    headers = ["Date", "Arena", "Player", "Method", "Status", "Amount"]
    rows = [
        [
            web_date(payment.created_at),
            # Plain hyphen: the PDF builder's core Helvetica is latin-1 — an
            # em dash here would crash rendering on the first orphan payment.
            arena_name or "-",
            player_name,
            PAYMENT_METHOD_NAMES.get(payment.payment_method.value, payment.payment_method.value),
            web_status(
                "partially_refunded"
                if payment.id in partial
                else _PAID.get(payment.status.value, payment.status.value)
            ),
            web_rupees(payment.amount),
        ]
        for payment, arena_name, player_name in payments_raw
    ]
    return headers, rows


async def _admin_arenas_rows(db: AsyncSession) -> tuple[list[str], list[list[str]]]:
    all_rows: list[list[str]] = []
    for status in ArenaStatus:
        arenas, _ = await arena_repo.list_arenas_by_status(db, status, offset=0, limit=_LIMIT)
        all_rows.extend(
            [a.name, a.city.value, web_status(a.status), web_date(a.created_at)] for a in arenas
        )
    headers = ["Name", "City", "Status", "Registered"]
    return headers, all_rows


def _hour_label(hour: int) -> str:
    """7:00 PM – 8:00 PM (the PDF writes the dash as "-")."""
    return f"{time_12h(f'{hour:02d}:00')} – {time_12h(f'{(hour + 1) % 24:02d}:00')}"


async def _admin_system_rows(db: AsyncSession) -> tuple[list[str], list[list[str]]]:
    """Platform health summary (doc 08 §9 "System Report": active users,
    peak hours, popular sports) — metric/value rows, not a row-per-record
    listing like the other report types."""
    total_players = await admin_repo.count_users_by_role(db, UserRole.player)
    total_owners = await admin_repo.count_users_by_role(db, UserRole.owner)
    active_users = await admin_repo.count_active_users(db)
    approved_arenas = await admin_repo.count_arenas_by_status(db, ArenaStatus.approved)
    total_bookings = await admin_repo.count_bookings_since(db, None)
    revenue = await admin_repo.sum_platform_revenue(db)

    by_hour = await admin_repo.platform_bookings_by_hour(db)
    peak_hours = sorted(by_hour.items(), key=lambda pair: pair[1], reverse=True)[:3]
    peak_label = (
        ", ".join(f"{_hour_label(h)} ({n} booking{'' if n == 1 else 's'})" for h, n in peak_hours)
        if peak_hours
        else "No confirmed bookings yet"
    )

    per_sport = await admin_repo.bookings_per_sport(db)
    top_sports = sorted(per_sport.items(), key=lambda pair: pair[1], reverse=True)[:5]
    sports_label = (
        ", ".join(f"{sport} ({n})" for sport, n in top_sports)
        if top_sports
        else "No confirmed bookings yet"
    )

    headers = ["Metric", "Value"]
    rows = [
        ["Total players", str(total_players)],
        ["Total arena owners", str(total_owners)],
        ["Active users", str(active_users)],
        ["Approved arenas", str(approved_arenas)],
        ["Bookings (all time)", str(total_bookings)],
        ["Platform revenue", web_rupees(revenue)],
        ["Peak booking hours", peak_label],
        ["Popular sports (by bookings)", sports_label],
    ]
    return headers, rows


async def admin_report(
    db: AsyncSession,
    admin: User,
    *,
    report_type: AdminReportType,
    date_from: date | None,
    date_to: date | None,
    fmt: ReportFormat,
) -> tuple[bytes, str, str]:
    if admin.role != UserRole.admin:
        raise ForbiddenError("Only admins can generate platform reports.")

    if report_type == "users":
        headers, rows = await _admin_users_rows(db)
        title = "Platform Users"
    elif report_type == "bookings":
        headers, rows = await _admin_bookings_rows(db, date_from, date_to)
        title = "Platform Bookings"
    elif report_type == "revenue":
        headers, rows = await _admin_revenue_rows(db, date_from, date_to)
        title = "Platform Revenue"
    elif report_type == "system":
        headers, rows = await _admin_system_rows(db)
        title = "System Report"
    else:
        headers, rows = await _admin_arenas_rows(db)
        title = "Platform Arenas"

    body = _render(title, headers, rows, fmt)
    return body, _media_type(fmt), _filename(f"admin-{report_type}-report", fmt)
