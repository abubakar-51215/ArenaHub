"""Complaint business logic: player submission + admin triage."""

import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.complaint import repository as repo
from app.modules.complaint.model import Complaint, ComplaintCategory, ComplaintStatus
from app.modules.complaint.schema import ComplaintCreate, ComplaintResponse
from app.modules.user.model import User
from app.shared.pagination import PaginationParams, paginated


def _to_response(complaint: Complaint) -> ComplaintResponse:
    return ComplaintResponse(
        id=complaint.id,
        player_id=complaint.player_id,
        player_name=complaint.player.full_name if complaint.player else "",
        category=complaint.category,
        description=complaint.description,
        status=complaint.status,
        admin_response=complaint.admin_response,
        resolved_at=complaint.resolved_at,
        created_at=complaint.created_at,
    )


async def submit_complaint(
    db: AsyncSession, user: User, data: ComplaintCreate
) -> ComplaintResponse:
    complaint = Complaint(
        player_id=user.id,
        category=data.category,
        description=data.description,
        status=ComplaintStatus.open,
    )
    await repo.add_complaint(db, complaint)
    await db.commit()
    saved = await repo.get_complaint(db, complaint.id)
    assert saved is not None
    return _to_response(saved)


async def list_my_complaints(db: AsyncSession, user: User, params: PaginationParams) -> dict:
    rows, total = await repo.list_my_complaints(
        db, user.id, offset=params.offset, limit=params.page_size
    )
    return paginated([_to_response(c) for c in rows], total, params)


async def list_all_complaints(
    db: AsyncSession,
    *,
    status: ComplaintStatus | None,
    category: ComplaintCategory | None,
    params: PaginationParams,
) -> dict:
    rows, total = await repo.list_all_complaints(
        db, status=status, category=category, offset=params.offset, limit=params.page_size
    )
    return paginated([_to_response(c) for c in rows], total, params)


async def get_complaint(db: AsyncSession, complaint_id: uuid.UUID) -> ComplaintResponse:
    complaint = await repo.get_complaint(db, complaint_id)
    if complaint is None:
        raise NotFoundError("Complaint not found.")
    return _to_response(complaint)


async def respond_to_complaint(
    db: AsyncSession,
    complaint_id: uuid.UUID,
    admin_response: str,
    status: ComplaintStatus,
) -> ComplaintResponse:
    complaint = await repo.get_complaint(db, complaint_id)
    if complaint is None:
        raise NotFoundError("Complaint not found.")
    complaint.admin_response = admin_response
    complaint.status = status
    complaint.resolved_at = datetime.now() if status == ComplaintStatus.resolved else None
    await db.commit()
    saved = await repo.get_complaint(db, complaint_id)
    assert saved is not None
    return _to_response(saved)


async def count_open(db: AsyncSession) -> int:
    return await repo.count_open(db)
