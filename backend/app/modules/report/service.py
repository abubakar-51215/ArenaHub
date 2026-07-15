"""Report generation: player booking history, owner booking/revenue, and
admin platform-wide (users/bookings/revenue/arenas/system) — each exportable
as CSV or PDF with an optional date range. Nothing here is persisted; every
report is built fresh from the same repositories the dashboards already query.
"""

import uuid
from datetime import date, datetime, time
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.modules.admin import repository as admin_repo
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaStatus
from app.modules.booking import repository as booking_repo
from app.modules.report.builders import rows_to_csv, rows_to_pdf
from app.modules.user.model import User, UserRole

ReportFormat = Literal["csv", "pdf"]
AdminReportType = Literal["users", "bookings", "revenue", "arenas", "system"]

_LIMIT = 5000  # a report is a bulk export, not a paginated view


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

    headers = ["Date", "Time", "Status", "Payment Status", "Amount (PKR)"]
    rows = [
        [
            b.booking_date.isoformat(),
            f"{b.start_time.strftime('%H:%M')}-{b.end_time.strftime('%H:%M')}",
            b.status.value,
            b.payment_status.value,
            str(b.total_amount),
        ]
        for b in bookings
    ]
    body = _render("My Bookings", headers, rows, fmt)
    return body, _media_type(fmt), _filename("my-bookings", fmt)


async def owner_report(
    db: AsyncSession,
    user: User,
    *,
    date_from: date | None,
    date_to: date | None,
    arena_id: uuid.UUID | None,
    fmt: ReportFormat,
) -> tuple[bytes, str, str]:
    if arena_id is not None:
        arena_ids = [arena_id]
    else:
        arena_ids = await arena_repo.list_owner_arena_ids(db, user.id)

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

    headers = ["Date", "Arena", "Court", "Player", "Status", "Payment Status", "Amount (PKR)"]
    rows = [
        [
            booking.booking_date.isoformat(),
            arena_name,
            court_name,
            player_name,
            booking.status.value,
            booking.payment_status.value,
            str(booking.total_amount),
        ]
        for booking, court_name, arena_name, player_name in rows_raw
    ]
    body = _render("Owner Bookings & Revenue", headers, rows, fmt)
    return body, _media_type(fmt), _filename("owner-report", fmt)


async def _admin_users_rows(db: AsyncSession) -> tuple[list[str], list[list[str]]]:
    users, _ = await admin_repo.list_users(
        db, role=None, is_active=None, search=None, offset=0, limit=_LIMIT
    )
    headers = ["Name", "Email", "Role", "Active", "Verified", "Joined"]
    rows = [
        [
            u.full_name,
            u.email,
            u.role.value,
            "Yes" if u.is_active else "No",
            "Yes" if u.is_verified else "No",
            u.created_at.date().isoformat(),
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
    headers = ["Date", "Arena", "Court", "Player", "Status", "Amount (PKR)"]
    rows = [
        [
            booking.booking_date.isoformat(),
            arena_name,
            court_name,
            player_name,
            booking.status.value,
            str(booking.total_amount),
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
    headers = ["Date", "Arena", "Player", "Method", "Status", "Amount (PKR)"]
    rows = [
        [
            payment.created_at.date().isoformat(),
            # Plain hyphen: the PDF builder's core Helvetica is latin-1 — an
            # em dash here would crash rendering on the first orphan payment.
            arena_name or "-",
            player_name,
            payment.payment_method.value,
            payment.status.value,
            str(payment.amount),
        ]
        for payment, arena_name, player_name in payments_raw
    ]
    return headers, rows


async def _admin_arenas_rows(db: AsyncSession) -> tuple[list[str], list[list[str]]]:
    all_rows: list[list[str]] = []
    for status in ArenaStatus:
        arenas, _ = await arena_repo.list_arenas_by_status(db, status, offset=0, limit=_LIMIT)
        all_rows.extend(
            [a.name, a.city.value, a.status.value, a.created_at.date().isoformat()] for a in arenas
        )
    headers = ["Name", "City", "Status", "Registered"]
    return headers, all_rows


def _hour_label(hour: int) -> str:
    # Plain hyphen: the PDF builder's core Helvetica is latin-1, no en dash.
    return f"{hour:02d}:00-{(hour + 1) % 24:02d}:00"


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
        ", ".join(f"{_hour_label(h)} ({n} bookings)" for h, n in peak_hours)
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
        ["Platform revenue (PKR)", f"{revenue:.2f}"],
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
