"""Data access for reviews. Repository layer: queries and inserts only.

Callers own the transaction.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.modules.arena.model import Arena
from app.modules.review.model import Review
from app.modules.user.model import User


async def get_review(db: AsyncSession, review_id: uuid.UUID) -> Review | None:
    return await db.get(Review, review_id)


async def get_review_by_booking(db: AsyncSession, booking_id: uuid.UUID) -> Review | None:
    result = await db.execute(select(Review).where(Review.booking_id == booking_id))
    return result.scalar_one_or_none()


async def add_review(db: AsyncSession, review: Review) -> Review:
    db.add(review)
    await db.flush()
    return review


async def list_arena_reviews(
    db: AsyncSession, arena_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[tuple[Review, str]], int]:
    """Reviews for an arena joined to the reviewer's name, newest first."""
    base = select(Review).where(Review.arena_id == arena_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        select(Review, User.full_name)
        .join(User, User.id == Review.player_id)
        .where(Review.arena_id == arena_id)
        .order_by(Review.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [(review, name) for review, name in result.all()], total


async def list_flagged_reviews(
    db: AsyncSession, *, offset: int, limit: int
) -> tuple[list[tuple[Review, str, str, str | None]], int]:
    """Reported reviews for the admin moderation queue, oldest report first
    (FIFO, same order the arena verification queue uses). Each row is
    ``(review, reviewer_name, arena_name, reporter_name)`` — reporter is
    None if the reporting account was since deleted (FK is SET NULL)."""
    reporter = aliased(User)
    base = select(Review).where(Review.is_flagged.is_(True))
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(
        select(Review, User.full_name, Arena.name, reporter.full_name)
        .join(User, User.id == Review.player_id)
        .join(Arena, Arena.id == Review.arena_id)
        .join(reporter, reporter.id == Review.flagged_by, isouter=True)
        .where(Review.is_flagged.is_(True))
        .order_by(Review.flagged_at.asc())
        .offset(offset)
        .limit(limit)
    )
    return [(r, reviewer, arena, rep) for r, reviewer, arena, rep in result.all()], total


async def get_rating_summary(db: AsyncSession, arena_id: uuid.UUID) -> tuple[float | None, int]:
    """Live-computed ``(average_rating, review_count)`` for an arena."""
    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.arena_id == arena_id)
    )
    average, count = result.one()
    return (float(average) if average is not None else None), count
