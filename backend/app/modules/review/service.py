"""Review business logic: submit (completed bookings only, one per booking),
edit (30-day window)/delete, owner response, report/flag, and the live
rating-recompute aggregate (MASTER_DEVELOPMENT_PLAN.md Track B scope).

Booking completion is owned entirely by ``booking.service.
complete_finished_bookings``, run every 15 minutes by the APScheduler job in
``app/tasks/scheduler.py`` — it promotes ``confirmed`` bookings whose slot
end time has passed to ``completed``. This module only ever reads that
status; it does not mutate bookings.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaStatus
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import Booking, BookingStatus
from app.modules.review import repository as repo
from app.modules.review.model import Review
from app.modules.review.schema import (
    ModerationReviewResponse,
    ReviewCreate,
    ReviewResponse,
    ReviewUpdate,
)
from app.modules.user.model import User, UserRole

EDIT_WINDOW = timedelta(days=30)


def _to_response(review: Review, reviewer_name: str) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        player_id=review.player_id,
        reviewer_name=reviewer_name,
        arena_id=review.arena_id,
        booking_id=review.booking_id,
        rating=review.rating,
        review_text=review.review_text,
        owner_response=review.owner_response,
        owner_response_at=review.owner_response_at,
        is_flagged=review.is_flagged,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


async def _completed_own_booking(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await booking_repo.get_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.")
    if booking.player_id != user.id:
        raise ForbiddenError("You do not own this booking.")
    if booking.status != BookingStatus.completed:
        raise ConflictError("Only completed bookings can be reviewed.")
    return booking


async def submit_review(
    db: AsyncSession, user: User, arena_id: uuid.UUID, data: ReviewCreate
) -> ReviewResponse:
    booking = await _completed_own_booking(db, user, data.booking_id)
    if booking.arena_id != arena_id:
        raise ValidationError("Booking does not belong to this arena.")
    if await repo.get_review_by_booking(db, data.booking_id) is not None:
        raise ConflictError("This booking has already been reviewed.")

    review = Review(
        player_id=user.id,
        arena_id=arena_id,
        booking_id=data.booking_id,
        rating=data.rating,
        review_text=data.review_text,
    )
    saved = await repo.add_review(db, review)
    await db.commit()
    return _to_response(saved, user.full_name)


async def list_arena_reviews(
    db: AsyncSession, arena_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[ReviewResponse], int]:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")
    rows, total = await repo.list_arena_reviews(db, arena_id, offset=offset, limit=limit)
    return [_to_response(review, name) for review, name in rows], total


async def get_rating_summary(db: AsyncSession, arena_id: uuid.UUID) -> tuple[float | None, int]:
    return await repo.get_rating_summary(db, arena_id)


async def update_review(
    db: AsyncSession, user: User, review_id: uuid.UUID, data: ReviewUpdate
) -> ReviewResponse:
    review = await repo.get_review(db, review_id)
    if review is None:
        raise NotFoundError("Review not found.")
    if review.player_id != user.id:
        raise ForbiddenError("You may only edit your own review.")
    if datetime.now() - review.created_at > EDIT_WINDOW:
        raise ConflictError("The 30-day edit window for this review has passed.")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(review, field, value)
    await db.commit()
    # ``updated_at`` is server-set via onupdate=func.now(); an UPDATE doesn't
    # eagerly return it the way an INSERT's server_default does, so the
    # in-memory value would be stale (and a lazy refresh would break the
    # async session) without an explicit refresh.
    await db.refresh(review)
    return _to_response(review, user.full_name)


async def delete_review(db: AsyncSession, user: User, review_id: uuid.UUID) -> None:
    review = await repo.get_review(db, review_id)
    if review is None:
        raise NotFoundError("Review not found.")
    if review.player_id != user.id and user.role != UserRole.admin:
        raise ForbiddenError("You do not have permission to delete this review.")
    if user.role == UserRole.admin and review.player_id != user.id:
        # A moderation action, not self-service — leave an audit trail.
        from app.modules.admin.service import record_audit

        await record_audit(
            db, user, "review.delete", "review", str(review_id), {"arena_id": str(review.arena_id)}
        )
    await db.delete(review)
    await db.commit()


async def report_review(db: AsyncSession, user: User, review_id: uuid.UUID, reason: str) -> None:
    review = await repo.get_review(db, review_id)
    if review is None:
        raise NotFoundError("Review not found.")
    if review.is_flagged:
        return
    review.is_flagged = True
    review.flag_reason = reason
    review.flagged_by = user.id
    review.flagged_at = datetime.now()
    await db.commit()


# ---- admin moderation ------------------------------------------------------


def _to_moderation_row(
    review: Review, reviewer_name: str, arena_name: str, reporter_name: str | None
) -> ModerationReviewResponse:
    return ModerationReviewResponse(
        id=review.id,
        arena_id=review.arena_id,
        arena_name=arena_name,
        reviewer_name=reviewer_name,
        rating=review.rating,
        review_text=review.review_text,
        flag_reason=review.flag_reason,
        reporter_name=reporter_name,
        flagged_at=review.flagged_at,
        created_at=review.created_at,
    )


async def list_flagged_reviews(
    db: AsyncSession, *, offset: int, limit: int
) -> tuple[list[ModerationReviewResponse], int]:
    rows, total = await repo.list_flagged_reviews(db, offset=offset, limit=limit)
    return [_to_moderation_row(*row) for row in rows], total


async def dismiss_flag(db: AsyncSession, admin: User, review_id: uuid.UUID) -> None:
    """Admin judged the report unfounded: clear the flag, keep the review."""
    review = await repo.get_review(db, review_id)
    if review is None:
        raise NotFoundError("Review not found.")
    if not review.is_flagged:
        raise ValidationError("This review is not flagged.")
    review.is_flagged = False
    review.flag_reason = None
    review.flagged_by = None
    review.flagged_at = None

    # Local import: admin.service imports arena.service, which sits upstream
    # of reviews — importing it at module scope here would risk a cycle.
    from app.modules.admin.service import record_audit

    await record_audit(db, admin, "review.dismiss_flag", "review", str(review_id))
    await db.commit()


async def respond_to_review(
    db: AsyncSession, user: User, review_id: uuid.UUID, response_text: str
) -> ReviewResponse:
    review = await repo.get_review(db, review_id)
    if review is None:
        raise NotFoundError("Review not found.")
    arena = await arena_repo.get_arena(db, review.arena_id)
    if arena is None or arena.owner_id != user.id:
        raise ForbiddenError("You do not own the arena this review belongs to.")

    review.owner_response = response_text
    review.owner_response_at = datetime.now()
    await db.commit()
    await db.refresh(review)
    reviewer = await db.get(User, review.player_id)
    reviewer_name = reviewer.full_name if reviewer else ""
    return _to_response(review, reviewer_name)
