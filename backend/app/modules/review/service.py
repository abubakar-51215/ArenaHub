"""Review business logic: submit (completed bookings only, one per booking),
edit (30-day window)/delete, owner response, report/flag, and the live
rating-recompute aggregate (MASTER_DEVELOPMENT_PLAN.md Track B scope).

Booking completion: no code path anywhere yet transitions a ``Booking`` to
``completed`` (Track A gap — flagged in docs/DEVELOPMENT_LOG.md as an open
item, not something this module owns the fix for). Review submission can't
function at all without it, so this module applies a narrow, idempotent
auto-complete here: a ``confirmed`` booking whose slot end time has already
passed is completed on read, the same way an expired-but-unprocessed state
is normally reconciled lazily elsewhere in this codebase (e.g. stale
pending_payment cleanup). This does not touch ``booking.service`` — it only
mutates the row this module already needs to load.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import Booking, BookingStatus
from app.modules.review import repository as repo
from app.modules.review.model import Review
from app.modules.review.schema import ReviewCreate, ReviewResponse, ReviewUpdate
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

    if booking.status == BookingStatus.confirmed:
        ends_at = datetime.combine(booking.booking_date, booking.end_time)
        if ends_at <= datetime.now():
            booking.status = BookingStatus.completed

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
