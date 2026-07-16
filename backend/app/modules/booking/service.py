"""Booking business logic: create (lock -> re-check -> price -> pending_payment),
reschedule, cancel-with-refund-eligibility, and the stale-booking sweep that
the APScheduler task calls periodically.

Payment processing itself (webhook auto-confirm, bank_transfer owner
approval, actual refund execution) belongs to modules/payment/. Equipment
addons (docs/11 section 8) are reserved at create time against the first
booking row in the group and released on cancellation/auto-cancel — see
``modules/equipment/service.py``'s ``reserve_for_booking``/
``release_for_booking``, the integration checkpoint between the two modules.
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.locking import acquire_slot_lock, release_slot_lock
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.arena.model import ArenaStatus, DiscountCode
from app.modules.booking import repository as repo
from app.modules.booking.model import Booking, BookingStatus, PaymentPlan, PaymentStatus
from app.modules.booking.schema import (
    BookingCreateRequest,
    BookingGroupResponse,
    BookingResponse,
)
from app.modules.court import repository as court_repo
from app.modules.equipment import service as equipment_service
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User, UserRole
from app.shared.notify import notify_user
from app.shared.pagination import PaginationParams
from app.shared.pricing import apply_discount
from app.shared.refunds import resolve_refund_percentage
from app.websocket.manager import broadcast_slot_status

STALE_PENDING_PAYMENT_AFTER = timedelta(hours=24)
# (lead time, tolerance either side, notification event name). Tolerance
# must be >= half the scheduler's run interval so a booking starting exactly
# on a lead time is never missed between two runs.
REMINDER_WINDOWS = [
    (timedelta(hours=24), timedelta(minutes=20), "booking_reminder_24h", "reminder_24h_sent_at"),
    (timedelta(hours=1), timedelta(minutes=20), "booking_reminder_1h", "reminder_1h_sent_at"),
]


def _is_discount_usable(discount: DiscountCode, subtotal: Decimal, now: datetime) -> bool:
    if not discount.is_active:
        return False
    if discount.valid_from and now < discount.valid_from.replace(tzinfo=None):
        return False
    if discount.valid_until and now > discount.valid_until.replace(tzinfo=None):
        return False
    if discount.max_uses is not None and discount.used_count >= discount.max_uses:
        return False
    return subtotal >= discount.min_booking_amount


async def create_booking(
    db: AsyncSession, user: User, data: BookingCreateRequest
) -> BookingGroupResponse:
    if user.role != UserRole.player:
        raise ForbiddenError("Only players can create bookings.")

    court = await court_repo.get_court(db, data.court_id)
    if court is None or not court.is_available:
        raise NotFoundError("Court not found.")
    arena = await arena_repo.get_arena(db, court.arena_id)
    if arena is None or arena.status != ArenaStatus.approved or not arena.is_active:
        raise NotFoundError("Arena not found.")

    if data.payment_type == PaymentPlan.advance and arena.require_full_payment:
        raise ValidationError("This arena requires full payment (no advance option).")

    slot_ids = list(dict.fromkeys(data.slot_ids))
    slots: list[TimeSlot] = []
    for slot_id in slot_ids:
        slot = await slot_repo.get_slot(db, slot_id)
        if slot is None or slot.court_id != court.id:
            raise NotFoundError(f"Slot {slot_id} not found.")
        slots.append(slot)
    slots.sort(key=lambda s: (s.date, s.start_time))
    if len({s.date for s in slots}) > 1:
        raise ValidationError("All slots in one booking must be on the same date.")

    acquired: list[tuple[str, str]] = []
    try:
        for slot in slots:
            ok, key, token = await acquire_slot_lock(court.id, slot.date, slot.start_time)
            if not ok:
                raise ConflictError("One of the selected slots is being booked right now.")
            acquired.append((key, token))

        fresh_slots: list[TimeSlot] = []
        for slot in slots:
            fresh = await slot_repo.get_slot_for_update(db, slot.id)
            if fresh is None or fresh.status != SlotStatus.available:
                raise ConflictError("One of the selected slots is no longer available.")
            fresh_slots.append(fresh)

        subtotal = sum((s.price for s in fresh_slots), Decimal("0"))
        discounted_total = subtotal
        discount = None
        if data.discount_code:
            discount = await arena_repo.get_discount_by_code(db, arena.id, data.discount_code)
            if discount is None or not _is_discount_usable(discount, subtotal, datetime.now()):
                raise ValidationError("Invalid or inapplicable discount code.")
            discounted_total = apply_discount(subtotal, discount)

        group_id = uuid.uuid4()
        bookings: list[Booking] = []
        allocated = Decimal("0")
        for i, slot in enumerate(fresh_slots):
            if i == len(fresh_slots) - 1:
                share = discounted_total - allocated
            else:
                share = (
                    (slot.price / subtotal * discounted_total).quantize(Decimal("0.01"))
                    if subtotal
                    else Decimal("0")
                )
            allocated += share

            if data.payment_type == PaymentPlan.advance:
                advance = (share * Decimal(arena.advance_percentage) / Decimal(100)).quantize(
                    Decimal("0.01")
                )
            else:
                advance = share
            remaining = share - advance

            booking = Booking(
                player_id=user.id,
                arena_id=arena.id,
                court_id=court.id,
                slot_id=slot.id,
                booking_group_id=group_id,
                booking_date=slot.date,
                start_time=slot.start_time,
                end_time=slot.end_time,
                total_amount=share,
                advance_amount=advance,
                remaining_amount=remaining,
                payment_type=data.payment_type,
                status=BookingStatus.pending_payment,
                payment_status=PaymentStatus.pending,
            )
            await repo.add_booking(db, booking)
            slot.status = SlotStatus.reserved
            bookings.append(booking)

        # Atomic conditional UPDATE, not a read-modify-write on the ORM object
        # — closes the TOCTOU race where two concurrent bookings both pass
        # the earlier `_is_discount_usable` check before either commits,
        # which could otherwise push used_count past max_uses.
        if discount is not None and not await arena_repo.try_increment_discount_usage(
            db, discount.id
        ):
            raise ConflictError("This discount code just reached its usage limit.")

        equipment_total = Decimal("0")
        if data.equipment:
            # Attached to the first row — one payment covers the whole
            # group, so the addon cost only needs to land once.
            equipment_total = await equipment_service.reserve_for_booking(
                db,
                bookings[0].id,
                arena.id,
                [(item.equipment_id, item.quantity) for item in data.equipment],
            )
            primary = bookings[0]
            primary.total_amount += equipment_total
            if primary.payment_type == PaymentPlan.advance:
                primary.advance_amount = (
                    primary.total_amount * Decimal(arena.advance_percentage) / Decimal(100)
                ).quantize(Decimal("0.01"))
            else:
                primary.advance_amount = primary.total_amount
            primary.remaining_amount = primary.total_amount - primary.advance_amount

        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise ConflictError("One of the selected slots was booked at the same time.") from exc
        for slot in fresh_slots:
            await broadcast_slot_status(
                court.id, slot.id, slot.date, slot.start_time, slot.status.value
            )
    finally:
        for key, token in acquired:
            await release_slot_lock(key, token)

    # discounted_total is the post-discount slot total; equipment is never
    # discounted, so the final total is that plus equipment. discount_amount
    # is the slot subtotal minus its discounted form (0 when no code applied).
    cents = Decimal("0.01")
    return BookingGroupResponse(
        booking_group_id=group_id,
        bookings=[BookingResponse.model_validate(b) for b in bookings],
        slots_subtotal=subtotal.quantize(cents),
        equipment_total=equipment_total.quantize(cents),
        discount_amount=(subtotal - discounted_total).quantize(cents),
        total=(discounted_total + equipment_total).quantize(cents),
    )


async def _visible_booking(db: AsyncSession, user: User, booking_id: uuid.UUID) -> Booking:
    booking = await repo.get_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.")
    if user.role == UserRole.admin:
        return booking
    if user.role == UserRole.player and booking.player_id == user.id:
        return booking
    if user.role == UserRole.owner:
        arena = await arena_repo.get_arena(db, booking.arena_id)
        if arena is not None and arena.owner_id == user.id:
            return booking
    raise ForbiddenError("You cannot view this booking.")


async def get_booking(db: AsyncSession, user: User, booking_id: uuid.UUID) -> BookingResponse:
    booking = await _visible_booking(db, user, booking_id)
    return BookingResponse.model_validate(booking)


async def list_my_bookings(
    db: AsyncSession, user: User, status: BookingStatus | None, params: PaginationParams
) -> tuple[list[BookingResponse], int]:
    rows, total = await repo.list_player_bookings(
        db, user.id, status=status, offset=params.offset, limit=params.page_size
    )
    return [BookingResponse.model_validate(r) for r in rows], total


async def list_arena_bookings(
    db: AsyncSession,
    user: User,
    arena_id: uuid.UUID,
    status: BookingStatus | None,
    params: PaginationParams,
) -> tuple[list[BookingResponse], int]:
    arena = await arena_repo.get_arena(db, arena_id)
    if arena is None:
        raise NotFoundError("Arena not found.")
    if arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    rows, total = await repo.list_arena_bookings(
        db, arena_id, status=status, offset=params.offset, limit=params.page_size
    )
    return [BookingResponse.model_validate(r) for r in rows], total


def _booking_start(booking: Booking) -> datetime:
    return datetime.combine(booking.booking_date, booking.start_time)


_CANCELLABLE = (
    BookingStatus.pending_payment,
    BookingStatus.pending_approval,
    BookingStatus.confirmed,
)
_RESCHEDULABLE = (BookingStatus.pending_approval, BookingStatus.confirmed)


async def cancel_booking(
    db: AsyncSession, user: User, booking_id: uuid.UUID, reason: str | None
) -> BookingResponse:
    booking = await _visible_booking(db, user, booking_id)
    if user.role == UserRole.player and booking.player_id != user.id:
        raise ForbiddenError("You cannot cancel someone else's booking.")
    # Row-locked re-read right before the status check/mutation — otherwise a
    # concurrent reschedule (or a second cancel) on the same booking could
    # pass its own status check against the same stale state and race this
    # transition (e.g. both a cancel and an in-flight reschedule committing).
    locked = await repo.get_booking_for_update(db, booking_id)
    if locked is None:
        raise NotFoundError("Booking not found.")
    booking = locked
    if booking.status not in _CANCELLABLE:
        raise ValidationError(f"A booking in '{booking.status}' status cannot be cancelled.")

    if booking.status == BookingStatus.pending_payment:
        refund_percentage = 0
    else:
        arena = await arena_repo.get_arena(db, booking.arena_id)
        hours_before = Decimal((_booking_start(booking) - datetime.now()).total_seconds()) / 3600
        refund_percentage = resolve_refund_percentage(
            arena.refund_policy if arena else [], max(hours_before, Decimal("0"))
        )

    slot = await slot_repo.get_slot(db, booking.slot_id)
    if slot is not None and slot.status != SlotStatus.available:
        slot.status = SlotStatus.available
        await broadcast_slot_status(
            booking.court_id, slot.id, slot.date, slot.start_time, slot.status.value
        )

    booking.status = BookingStatus.cancelled
    booking.cancellation_reason = reason
    booking.refund_percentage = refund_percentage
    booking.refund_eligible = refund_percentage > 0

    # No-op if this booking has no equipment lines (only the group's first
    # row ever does — see create_booking).
    await equipment_service.release_for_booking(db, booking.id)

    # Payment module owns refund execution; it only does anything if money
    # was actually captured for this booking (no-op for pending_payment
    # cancellations, where refund_percentage is always 0 above).
    from app.modules.payment.service import create_refund_for_cancelled_booking

    await create_refund_for_cancelled_booking(db, booking)
    await notify_user(db, booking.player_id, "booking_cancelled", booking_id=str(booking.id))

    await db.commit()
    return BookingResponse.model_validate(booking)


async def reschedule_booking(
    db: AsyncSession, user: User, booking_id: uuid.UUID, new_slot_id: uuid.UUID
) -> BookingResponse:
    booking = await _visible_booking(db, user, booking_id)
    if user.role == UserRole.player and booking.player_id != user.id:
        raise ForbiddenError("You cannot reschedule someone else's booking.")
    # Same row-lock rationale as cancel_booking: block a concurrent cancel
    # (or a second reschedule) on this booking from racing this transition.
    locked = await repo.get_booking_for_update(db, booking_id)
    if locked is None:
        raise NotFoundError("Booking not found.")
    booking = locked
    if booking.status not in _RESCHEDULABLE:
        raise ValidationError(f"A booking in '{booking.status}' status cannot be rescheduled.")
    if _booking_start(booking) <= datetime.now():
        raise ValidationError("Cannot reschedule a booking that has already started.")

    new_slot = await slot_repo.get_slot(db, new_slot_id)
    if new_slot is None or new_slot.court_id != booking.court_id:
        raise NotFoundError("Slot not found.")
    if new_slot.id == booking.slot_id:
        raise ValidationError("This is already the booked slot.")

    ok, key, token = await acquire_slot_lock(booking.court_id, new_slot.date, new_slot.start_time)
    if not ok:
        raise ConflictError("The requested slot is being booked right now.")
    try:
        fresh_new_slot = await slot_repo.get_slot(db, new_slot.id)
        if fresh_new_slot is None or fresh_new_slot.status != SlotStatus.available:
            raise ConflictError("The requested slot is no longer available.")

        old_slot = await slot_repo.get_slot(db, booking.slot_id)
        # Carry the old slot's occupancy status onto the new one, preserving
        # the pending_approval/confirmed invariant.
        fresh_new_slot.status = old_slot.status if old_slot is not None else SlotStatus.reserved
        if old_slot is not None:
            old_slot.status = SlotStatus.available

        booking.slot_id = fresh_new_slot.id
        booking.booking_date = fresh_new_slot.date
        booking.start_time = fresh_new_slot.start_time
        booking.end_time = fresh_new_slot.end_time

        # Reprice against the new slot and reconcile against what the player
        # has already paid upfront for this booking (its old total minus the
        # balance that was still outstanding). The player keeps the booking;
        # a positive price difference becomes an outstanding balance owed at
        # the venue or online — exactly like an advance booking's remaining
        # balance — rather than the booking silently absorbing the change and
        # showing as fully paid at the new (higher) amount. A negative
        # difference (cheaper slot) means the player overpaid and is refunded.
        already_paid = booking.total_amount - booking.remaining_amount
        new_total = fresh_new_slot.price
        booking.total_amount = new_total
        if new_total >= already_paid:
            booking.advance_amount = already_paid
            booking.remaining_amount = new_total - already_paid
        else:
            booking.advance_amount = new_total
            booking.remaining_amount = Decimal("0")
            from app.modules.payment.service import refund_reschedule_overpayment

            await refund_reschedule_overpayment(db, booking, already_paid - new_total)

        await db.commit()
        if old_slot is not None:
            await broadcast_slot_status(
                booking.court_id,
                old_slot.id,
                old_slot.date,
                old_slot.start_time,
                old_slot.status.value,
            )
        await broadcast_slot_status(
            booking.court_id,
            fresh_new_slot.id,
            fresh_new_slot.date,
            fresh_new_slot.start_time,
            fresh_new_slot.status.value,
        )
    finally:
        await release_slot_lock(key, token)

    return BookingResponse.model_validate(booking)


async def auto_cancel_stale_bookings(db: AsyncSession, now: datetime | None = None) -> int:
    """Cancel bookings still ``pending_payment`` after 24 hours, releasing
    their slots. Called by the APScheduler job in ``app/tasks/`` (added
    alongside the payment module)."""
    # Local import avoids a payment<->booking circular import (same seam as
    # cancel_booking's create_refund_for_cancelled_booking import below).
    from app.modules.payment import repository as payment_repo
    from app.modules.payment import state_machine
    from app.modules.payment.model import PaymentLifecycleStatus as Lifecycle
    from app.modules.payment.model import PaymentStatus as GatewayPaymentStatus

    cutoff = (now or datetime.now()) - STALE_PENDING_PAYMENT_AFTER
    stale = await repo.list_stale_pending_payment_for_update(db, cutoff)
    freed_slots: list[TimeSlot] = []
    marked_groups: set[uuid.UUID] = set()
    for booking in stale:
        slot = await slot_repo.get_slot(db, booking.slot_id)
        if slot is not None and slot.status == SlotStatus.reserved:
            slot.status = SlotStatus.available
            freed_slots.append(slot)
        booking.status = BookingStatus.cancelled
        booking.cancellation_reason = "Auto-cancelled: payment not completed within 24 hours."
        await equipment_service.release_for_booking(db, booking.id)

        # Also close out the gateway payment row so a webhook that arrives
        # after this sweep sees status != pending and no-ops instead of
        # resurrecting the booking it just cancelled (belt-and-suspenders on
        # top of handle_webhook's own booking-status check).
        if booking.booking_group_id not in marked_groups:
            marked_groups.add(booking.booking_group_id)
            payment = await payment_repo.get_payment_by_group(db, booking.booking_group_id)
            if payment is not None and payment.status == GatewayPaymentStatus.pending:
                payment.status = GatewayPaymentStatus.failed
                # Keep the fine-grained lifecycle in step with the coarse
                # status — the payment window elapsed, so it's expired.
                await state_machine.advance(
                    db, payment, Lifecycle.expired, note="Payment window elapsed (auto-cancel)."
                )
    await db.commit()
    for slot in freed_slots:
        await broadcast_slot_status(
            slot.court_id, slot.id, slot.date, slot.start_time, slot.status.value
        )
    return len(stale)


async def complete_finished_bookings(db: AsyncSession, now: datetime | None = None) -> int:
    """Transition confirmed bookings whose slot end time has passed to
    ``completed`` (docs/06 section 14: reviews require ``status ==
    completed``). Called by the APScheduler job in ``app/tasks/`` — this is
    the only place a booking is ever promoted to ``completed``.
    """
    current = now or datetime.now()
    candidates = await repo.list_confirmed_on_or_before(db, current.date())
    finished = [b for b in candidates if datetime.combine(b.booking_date, b.end_time) <= current]
    for booking in finished:
        booking.status = BookingStatus.completed
    if finished:
        await db.commit()
    return len(finished)


async def send_upcoming_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Notify players of confirmed bookings starting in ~24h or ~1h (docs
    Sprint 3: "reminders 24h/1h"). Called by the APScheduler job in
    ``app/tasks/``. Console-logs via ``shared/notify`` until the real
    notification module (Sprint 5) exists — see that module's docstring.

    Each window's ``*_sent_at`` column on Booking is checked/set so a delayed
    or re-run scheduler tick can never send the same reminder twice.
    """
    current = now or datetime.now()
    sent = 0
    for lead_time, tolerance, event, sent_at_field in REMINDER_WINDOWS:
        window_start = current + lead_time - tolerance
        window_end = current + lead_time + tolerance
        candidate_dates = {window_start.date(), window_end.date()}
        for booking in await repo.list_confirmed_bookings_on_dates(db, list(candidate_dates)):
            if getattr(booking, sent_at_field) is not None:
                continue
            start = _booking_start(booking)
            if window_start <= start <= window_end:
                await notify_user(db, booking.player_id, event, booking_id=str(booking.id))
                setattr(booking, sent_at_field, current)
                sent += 1
    if sent:
        await db.commit()
    return sent
