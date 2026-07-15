"""Data access for complaints. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.complaint.model import Complaint, ComplaintCategory, ComplaintStatus


def _with_player(stmt):  # type: ignore[no-untyped-def]
    return stmt.options(selectinload(Complaint.player), selectinload(Complaint.assigned_admin))


async def get_complaint(db: AsyncSession, complaint_id: uuid.UUID) -> Complaint | None:
    result = await db.execute(_with_player(select(Complaint).where(Complaint.id == complaint_id)))
    return result.scalar_one_or_none()


async def add_complaint(db: AsyncSession, complaint: Complaint) -> Complaint:
    db.add(complaint)
    await db.flush()
    return complaint


async def list_my_complaints(
    db: AsyncSession, player_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[Complaint], int]:
    base = select(Complaint).where(Complaint.player_id == player_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        _with_player(base).order_by(Complaint.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


async def list_all_complaints(
    db: AsyncSession,
    *,
    status: ComplaintStatus | None,
    category: ComplaintCategory | None,
    offset: int,
    limit: int,
) -> tuple[list[Complaint], int]:
    base = select(Complaint)
    if status is not None:
        base = base.where(Complaint.status == status)
    if category is not None:
        base = base.where(Complaint.category == category)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        _with_player(base).order_by(Complaint.created_at.desc()).offset(offset).limit(limit)
    )
    return list(result.scalars().all()), total


async def count_open(db: AsyncSession) -> int:
    return (
        await db.scalar(
            select(func.count()).where(
                Complaint.status.in_([ComplaintStatus.open, ComplaintStatus.under_review])
            )
        )
        or 0
    )
