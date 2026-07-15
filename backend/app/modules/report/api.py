"""Report export endpoints.

* ``router`` (``/reports``) — a player's own booking history.
* ``owner_router`` (``/owner/reports``) — an owner's bookings + revenue,
  optionally scoped to one arena.
* ``admin_router`` (``/admin/reports``) — platform-wide users/bookings/
  revenue/arenas.

All three return the file directly (``Content-Disposition: attachment``),
same as ``payment.api``'s receipt PDF endpoint.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.report import service
from app.modules.user.model import User
from app.shared.auth import get_current_user, require_role

router = APIRouter(prefix="/reports", tags=["reports"])
owner_router = APIRouter(prefix="/owner/reports", tags=["reports-owner"])
admin_router = APIRouter(prefix="/admin/reports", tags=["reports-admin"])

_owner = require_role("owner")
_admin = require_role("admin")


@router.get("/my-bookings", summary="Export my booking history")
async def export_my_bookings(
    format: service.ReportFormat = Query("csv"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    body, media_type, filename = await service.player_bookings_report(
        db, user, date_from=date_from, date_to=date_to, fmt=format
    )
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@owner_router.get("", summary="Export my arenas' bookings & revenue")
async def export_owner_report(
    format: service.ReportFormat = Query("csv"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    arena_id: uuid.UUID | None = Query(None),
    user: User = Depends(_owner),
    db: AsyncSession = Depends(get_db),
) -> Response:
    body, media_type, filename = await service.owner_report(
        db, user, date_from=date_from, date_to=date_to, arena_id=arena_id, fmt=format
    )
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@admin_router.get("", summary="Export a platform-wide report")
async def export_admin_report(
    type: service.AdminReportType = Query("bookings"),
    format: service.ReportFormat = Query("csv"),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    admin: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    body, media_type, filename = await service.admin_report(
        db, admin, report_type=type, date_from=date_from, date_to=date_to, fmt=format
    )
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
