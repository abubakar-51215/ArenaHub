"""Complaint endpoints.

* ``router`` — player submit/list-own.
* ``admin_router`` (``/admin/complaints``) — admin triage, guarded by
  ``require_role("admin")``.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.modules.admin import service as admin_service
from app.modules.complaint import service
from app.modules.complaint.model import ComplaintCategory, ComplaintStatus
from app.modules.complaint.schema import ComplaintCreate, ComplaintRespondRequest
from app.modules.user.model import User
from app.shared.auth import get_current_user, require_role
from app.shared.pagination import PaginationParams, pagination_params
from app.shared.response import success

router = APIRouter(prefix="/complaints", tags=["complaints"])
admin_router = APIRouter(prefix="/admin/complaints", tags=["admin-complaints"])

_admin = require_role("admin")


@router.post("", status_code=status.HTTP_201_CREATED, summary="Submit a complaint")
async def submit_complaint(
    data: ComplaintCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    complaint = await service.submit_complaint(db, user, data)
    return success(data=complaint, message="Complaint submitted.")


@router.get("/my", summary="Get own complaints")
async def list_my_complaints(
    params: PaginationParams = Depends(pagination_params),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_my_complaints(db, user, params)
    return success(data=data, message="Complaints retrieved.")


@admin_router.get("", summary="Get all complaints")
async def list_all_complaints(
    status: ComplaintStatus | None = None,
    category: ComplaintCategory | None = None,
    params: PaginationParams = Depends(pagination_params),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    data = await service.list_all_complaints(db, status=status, category=category, params=params)
    return success(data=data, message="Complaints retrieved.")


@admin_router.get("/{complaint_id}", summary="Get a complaint's detail")
async def get_complaint(
    complaint_id: uuid.UUID,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    complaint = await service.get_complaint(db, complaint_id)
    return success(data=complaint, message="Complaint retrieved.")


@admin_router.put("/{complaint_id}", summary="Respond to a complaint")
async def respond_to_complaint(
    complaint_id: uuid.UUID,
    data: ComplaintRespondRequest,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    complaint = await service.respond_to_complaint(
        db, complaint_id, data.admin_response, data.status
    )
    await admin_service.record_audit(
        db, user, "complaint.respond", "complaint", str(complaint_id), {"status": data.status.value}
    )
    await db.commit()
    return success(data=complaint, message="Complaint updated.")
