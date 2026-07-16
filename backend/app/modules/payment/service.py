"""Payment business logic: initiate a charge for a booking group, webhook
auto-confirm (card/JazzCash/EasyPaisa), bank_transfer receipt upload + owner
approval, and refunds (docs/PROJECT_GUIDELINES.md deviations #2/#2b).

card/JazzCash/EasyPaisa: pending_payment -> gateway webhook -> confirmed.
bank_transfer: pending_payment -> receipt uploaded -> pending_approval ->
owner approves/rejects -> confirmed or rejected. This module is the only
place that ever moves a booking group out of pending_payment.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.integrations.payments import get_provider
from app.modules.arena import repository as arena_repo
from app.modules.booking import repository as booking_repo
from app.modules.booking.model import Booking, BookingStatus, PaymentStatus
from app.modules.equipment import service as equipment_service
from app.modules.payment import repository as repo
from app.modules.payment import state_machine
from app.modules.payment.model import (
    Payment,
    PaymentMethod,
    PaymentPurpose,
    Refund,
    RefundStatus,
)
from app.modules.payment.model import (
    PaymentLifecycleStatus as Lifecycle,
)
from app.modules.payment.receipt import build_receipt_pdf
from app.modules.payment.schema import (
    PaymentEventResponse,
    PaymentHistoryItem,
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    PaymentResponse,
    RefundResponse,
)
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus
from app.modules.user.model import User, UserRole
from app.shared.notify import notify_user
from app.shared.pagination import PaginationParams, paginated
from app.shared.qr import generate_booking_qr
from app.websocket.manager import broadcast_slot_status

_PROVIDER_NAME = {
    PaymentMethod.card: "stripe",
    PaymentMethod.jazzcash: "jazzcash",
    PaymentMethod.easypaisa: "easypaisa",
    PaymentMethod.bank_transfer: "manual",
}


async def _group_bookings_for_player(
    db: AsyncSession, user: User, booking_group_id: uuid.UUID
) -> list[Booking]:
    bookings = await booking_repo.list_group(db, booking_group_id)
    if not bookings:
        raise NotFoundError("Booking group not found.")
    if any(b.player_id != user.id for b in bookings):
        raise ForbiddenError("You do not own this booking.")
    return bookings


async def list_my_payments(db: AsyncSession, user: User, params: PaginationParams) -> dict:
    rows, total = await repo.list_payments_for_player(
        db, user.id, offset=params.offset, limit=params.page_size
    )
    items = [
        PaymentHistoryItem(
            **PaymentResponse.model_validate(payment).model_dump(),
            arena_name=arena_name,
            booking_date=booking_date,
        )
        for payment, arena_name, booking_date in rows
    ]
    return paginated(items, total, params)


async def get_payment_by_group(
    db: AsyncSession, user: User, booking_group_id: uuid.UUID
) -> PaymentResponse:
    """Resolve the payment for a booking group — lets the client fetch a
    receipt from a booking it already has, without threading payment_id
    through every screen that only knows the booking/group id."""
    await _group_bookings_for_player(db, user, booking_group_id)
    payment = await repo.get_payment_by_group(db, booking_group_id)
    if payment is None:
        raise NotFoundError("No payment found for this booking group.")
    return PaymentResponse.model_validate(payment)


async def initiate_payment(
    db: AsyncSession, user: User, data: PaymentInitiateRequest
) -> PaymentInitiateResponse:
    if user.role != UserRole.player:
        raise ForbiddenError("Only players can pay for bookings.")

    bookings = await _group_bookings_for_player(db, user, data.booking_group_id)
    if any(b.status != BookingStatus.pending_payment for b in bookings):
        raise ValidationError("This booking group is not awaiting payment.")

    existing = await repo.get_payment_by_group(db, data.booking_group_id)
    if existing is not None and existing.status in (PaymentStatus.pending, PaymentStatus.completed):
        raise ConflictError("A payment for this booking already exists.")

    amount = sum((b.advance_amount for b in bookings), Decimal("0"))
    provider = get_provider(data.payment_method.value)
    result = await provider.initiate(
        amount=amount, currency="PKR", reference=str(data.booking_group_id)
    )

    payment = Payment(
        booking_group_id=data.booking_group_id,
        player_id=user.id,
        amount=amount,
        currency="PKR",
        payment_method=data.payment_method,
        payment_provider=_PROVIDER_NAME[data.payment_method],
        gateway_transaction_id=result.gateway_transaction_id,
        status=PaymentStatus.pending,
        payment_type=bookings[0].payment_type,
    )
    await repo.add_payment(db, payment)
    await state_machine.record_created(db, payment)
    if data.payment_method != PaymentMethod.bank_transfer:
        await state_machine.advance(
            db, payment, Lifecycle.initiated, note="Charge initiated with gateway."
        )
    await db.commit()

    return PaymentInitiateResponse(
        payment=PaymentResponse.model_validate(payment),
        client_secret=result.client_secret,
        redirect_url=result.redirect_url,
    )


async def initiate_balance_payment(
    db: AsyncSession, user: User, data: PaymentInitiateRequest
) -> PaymentInitiateResponse:
    """Pay an outstanding balance on an already-confirmed booking online
    (e.g. the difference after rescheduling to a pricier slot). Gateway
    methods only — a balance is otherwise settled in person at the venue."""
    if user.role != UserRole.player:
        raise ForbiddenError("Only players can pay for bookings.")
    if data.payment_method == PaymentMethod.bank_transfer:
        raise ValidationError("Pay the remaining balance online, or in person at the venue.")

    bookings = await _group_bookings_for_player(db, user, data.booking_group_id)
    if any(b.status != BookingStatus.confirmed for b in bookings):
        raise ValidationError("Only a confirmed booking can have its balance paid online.")
    outstanding = sum((b.remaining_amount for b in bookings), Decimal("0"))
    if outstanding <= 0:
        raise ValidationError("This booking has no outstanding balance.")
    if await repo.get_pending_balance_payment(db, data.booking_group_id) is not None:
        raise ConflictError("A balance payment is already in progress for this booking.")

    provider = get_provider(data.payment_method.value)
    result = await provider.initiate(
        amount=outstanding, currency="PKR", reference=str(data.booking_group_id)
    )
    payment = Payment(
        booking_group_id=data.booking_group_id,
        player_id=user.id,
        amount=outstanding,
        currency="PKR",
        payment_method=data.payment_method,
        payment_provider=_PROVIDER_NAME[data.payment_method],
        gateway_transaction_id=result.gateway_transaction_id,
        status=PaymentStatus.pending,
        payment_type=bookings[0].payment_type,
        purpose=PaymentPurpose.balance,
    )
    await repo.add_payment(db, payment)
    await state_machine.record_created(db, payment, note="Balance payment created.")
    await state_machine.advance(
        db, payment, Lifecycle.initiated, note="Balance charge initiated with gateway."
    )
    await db.commit()
    return PaymentInitiateResponse(
        payment=PaymentResponse.model_validate(payment),
        client_secret=result.client_secret,
        redirect_url=result.redirect_url,
    )


async def _confirm_group(db: AsyncSession, payment: Payment) -> None:
    """Move every booking in the group to confirmed, mark slots booked,
    generate QR codes, and broadcast the change. Idempotent per-payment: the
    caller only invokes this once ``payment.status`` flips to completed."""
    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    payment.status = PaymentStatus.completed
    await state_machine.advance(db, payment, Lifecycle.paid, note="Payment captured.")
    await state_machine.advance(db, payment, Lifecycle.confirmed, note="Booking group confirmed.")
    for booking in bookings:
        booking.status = BookingStatus.confirmed
        booking.payment_status = PaymentStatus.completed
        booking.qr_code_url = generate_booking_qr(booking.id)
        slot = await slot_repo.get_slot(db, booking.slot_id)
        if slot is not None:
            slot.status = SlotStatus.booked
            await broadcast_slot_status(
                booking.court_id, slot.id, slot.date, slot.start_time, slot.status.value
            )
        await notify_user(db, booking.player_id, "booking_confirmed", booking_id=str(booking.id))
    arena = await arena_repo.get_arena(db, bookings[0].arena_id)
    if arena is not None:
        await notify_user(db, arena.owner_id, "new_confirmed_booking", count=len(bookings))


async def _fail_group(
    db: AsyncSession, payment: Payment, *, rejected: bool, bookings: list[Booking] | None = None
) -> None:
    bookings = bookings or await booking_repo.list_group_for_update(db, payment.booking_group_id)
    payment.status = PaymentStatus.failed
    await state_machine.advance(
        db,
        payment,
        Lifecycle.rejected if rejected else Lifecycle.failed,
        note="Receipt rejected by owner." if rejected else "Payment failed.",
    )
    target_status = BookingStatus.rejected if rejected else BookingStatus.cancelled
    for booking in bookings:
        booking.status = target_status
        booking.payment_status = PaymentStatus.failed
        slot = await slot_repo.get_slot(db, booking.slot_id)
        if slot is not None and slot.status != SlotStatus.available:
            slot.status = SlotStatus.available
            await broadcast_slot_status(
                booking.court_id, slot.id, slot.date, slot.start_time, slot.status.value
            )
        await equipment_service.release_for_booking(db, booking.id)
        await notify_user(
            db, booking.player_id, "booking_payment_failed", booking_id=str(booking.id)
        )


async def _settle_balance(db: AsyncSession, payment: Payment) -> None:
    """A balance top-up captured: zero the outstanding on the group's
    (already-confirmed) bookings and mark them fully paid. Does NOT re-confirm
    or re-broadcast — the bookings/slots are unchanged."""
    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    payment.status = PaymentStatus.completed
    await state_machine.advance(db, payment, Lifecycle.paid, note="Balance captured.")
    await state_machine.advance(db, payment, Lifecycle.confirmed, note="Balance settled.")
    for booking in bookings:
        booking.advance_amount = booking.total_amount
        booking.remaining_amount = Decimal("0.00")
        booking.payment_status = PaymentStatus.completed
        await notify_user(db, booking.player_id, "balance_paid", booking_id=str(booking.id))


async def _fail_balance(db: AsyncSession, payment: Payment) -> None:
    """A balance top-up failed: mark the payment failed but leave the
    confirmed bookings alone — the balance is simply still owed (at the venue,
    or via another online attempt)."""
    payment.status = PaymentStatus.failed
    await state_machine.advance(db, payment, Lifecycle.failed, note="Balance payment failed.")


async def handle_webhook(
    db: AsyncSession, payment_method: str, payload: bytes, headers: dict
) -> None:
    provider = get_provider(payment_method)
    event = provider.verify_webhook(payload, headers)
    payment = await repo.get_payment_by_gateway_transaction_id_for_update(
        db, event.gateway_transaction_id
    )
    if payment is None:
        raise NotFoundError("Payment not found for this transaction.")
    # The transaction id alone isn't enough to trust the callback — verify the
    # route the request arrived on (jazzcash/easypaisa/card) actually matches
    # the provider this payment was initiated with, so a signed callback from
    # one gateway can't be replayed against a payment from another.
    if _PROVIDER_NAME.get(payment.payment_method) != payment_method:
        raise ValidationError("Webhook provider does not match this payment's method.")
    if payment.status != PaymentStatus.pending:
        return  # already processed — webhooks can be retried by the gateway
    if payment.amount != event.amount or payment.currency.upper() != event.currency.upper():
        raise ValidationError("Webhook amount or currency does not match this payment.")

    # A balance top-up settles the outstanding on already-confirmed bookings —
    # it doesn't touch booking status, so it skips the pending_payment guard.
    if payment.purpose == PaymentPurpose.balance:
        if event.status == "completed":
            await _settle_balance(db, payment)
        else:
            await _fail_balance(db, payment)
        await db.commit()
        return

    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    if any(b.status != BookingStatus.pending_payment for b in bookings):
        # The auto-cancel scheduler (or some other path) already moved these
        # bookings on — a late-arriving webhook must not resurrect them.
        return

    if event.status == "completed":
        await _confirm_group(db, payment)
    else:
        await _fail_group(db, payment, rejected=False, bookings=bookings)
    await db.commit()


async def dev_simulate_confirm(
    db: AsyncSession, user: User, payment_id: uuid.UUID, success: bool
) -> PaymentResponse:
    """Dev/test-only convenience to drive a payment to completion/failure
    without a real gateway webhook round trip. Mirrors the mocked provider
    simulation used when no gateway credentials are configured."""
    if not get_settings().is_dev:
        raise NotFoundError("Not found.")
    payment = await repo.get_payment_for_update(db, payment_id)
    if payment is None or payment.player_id != user.id:
        raise NotFoundError("Payment not found.")
    if payment.payment_method == PaymentMethod.bank_transfer:
        raise ValidationError("bank_transfer is confirmed by owner approval, not a webhook.")
    if payment.status != PaymentStatus.pending:
        raise ValidationError("This payment has already been resolved.")

    if payment.purpose == PaymentPurpose.balance:
        if success:
            await _settle_balance(db, payment)
        else:
            await _fail_balance(db, payment)
    elif success:
        await _confirm_group(db, payment)
    else:
        await _fail_group(db, payment, rejected=False)
    await db.commit()
    return PaymentResponse.model_validate(payment)


async def upload_receipt(
    db: AsyncSession, user: User, payment_id: uuid.UUID, receipt_proof_url: str
) -> PaymentResponse:
    payment = await repo.get_payment_for_update(db, payment_id)
    if payment is None or payment.player_id != user.id:
        raise NotFoundError("Payment not found.")
    if payment.payment_method != PaymentMethod.bank_transfer:
        raise ValidationError("Only bank_transfer payments take a receipt upload.")
    if payment.status != PaymentStatus.pending:
        raise ValidationError("This payment has already been resolved.")

    payment.receipt_proof_url = receipt_proof_url
    await state_machine.advance(
        db, payment, Lifecycle.pending_approval, note="Bank-transfer receipt uploaded."
    )
    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    for booking in bookings:
        booking.status = BookingStatus.pending_approval
    await db.commit()
    return PaymentResponse.model_validate(payment)


async def _owned_bank_transfer_payment(
    db: AsyncSession, user: User, payment_id: uuid.UUID
) -> Payment:
    payment = await repo.get_payment_for_update(db, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.")
    if payment.payment_method != PaymentMethod.bank_transfer:
        raise ValidationError("Only bank_transfer payments require owner approval.")
    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    if not bookings:
        raise NotFoundError("Booking group not found.")
    arena = await arena_repo.get_arena(db, bookings[0].arena_id)
    if arena is None or arena.owner_id != user.id:
        raise ForbiddenError("You do not own this arena.")
    if payment.receipt_proof_url is None:
        raise ValidationError("No receipt has been uploaded yet.")
    if payment.status != PaymentStatus.pending:
        raise ValidationError("This payment has already been resolved.")
    return payment


async def approve_bank_transfer(
    db: AsyncSession, user: User, payment_id: uuid.UUID
) -> PaymentResponse:
    payment = await _owned_bank_transfer_payment(db, user, payment_id)
    await _confirm_group(db, payment)
    await db.commit()
    return PaymentResponse.model_validate(payment)


async def reject_bank_transfer(
    db: AsyncSession, user: User, payment_id: uuid.UUID, reason: str
) -> PaymentResponse:
    payment = await _owned_bank_transfer_payment(db, user, payment_id)
    bookings = await booking_repo.list_group_for_update(db, payment.booking_group_id)
    for booking in bookings:
        booking.cancellation_reason = reason
    await _fail_group(db, payment, rejected=True, bookings=bookings)
    await db.commit()
    return PaymentResponse.model_validate(payment)


# ---- refunds --------------------------------------------------------------


async def _mark_refunded_if_fully(db: AsyncSession, payment: Payment) -> None:
    """Advance a payment's lifecycle to ``refunded`` once the total refunded
    against it reaches the captured amount. Partial refunds (one slot of a
    multi-slot group, a reschedule overpayment) leave the lifecycle untouched
    — they're recorded as ``Refund`` rows in their own right."""
    if payment.lifecycle_status not in (Lifecycle.paid, Lifecycle.confirmed):
        return
    refunded = await repo.sum_refunds_for_payment(db, payment.id)
    if refunded >= payment.amount:
        await state_machine.advance(db, payment, Lifecycle.refunded, note="Fully refunded.")


async def _issue_refund(
    db: AsyncSession,
    *,
    booking: Booking,
    payment: Payment,
    requested_amount: Decimal,
    reason: str,
    kind: str,
) -> Refund | None:
    """The single place a refund is created and processed. Centrally enforces
    the invariant **total refunds against a payment never exceed the captured
    amount** by capping ``requested_amount`` at what's still refundable
    (``payment.amount`` minus everything already refunded). Records the audit
    event, promotes the payment to ``refunded`` when fully refunded, and
    notifies the player. Returns None if nothing is left to refund."""
    refundable = payment.amount - await repo.sum_refunds_for_payment(db, payment.id)
    amount = min(requested_amount, refundable).quantize(Decimal("0.01"))
    if amount <= 0:
        return None

    refund = Refund(
        booking_id=booking.id,
        payment_id=payment.id,
        amount=amount,
        reason=reason,
        status=RefundStatus.pending,
    )
    await repo.add_refund(db, refund)

    provider = get_provider(payment.payment_method.value)
    result = await provider.refund(
        gateway_transaction_id=payment.gateway_transaction_id or "", amount=amount
    )
    refund.status = RefundStatus.processed if result.status == "processed" else RefundStatus.pending
    if refund.status == RefundStatus.processed:
        refund.processed_at = datetime.now()
    await state_machine.record_note(db, payment, f"Refund of Rs. {amount} issued ({kind}).")
    await _mark_refunded_if_fully(db, payment)
    await notify_user(
        db, booking.player_id, "refund_initiated", booking_id=str(booking.id), amount=str(amount)
    )
    return refund


async def create_refund_for_cancelled_booking(db: AsyncSession, booking: Booking) -> Refund | None:
    """Called by the booking module right after it cancels a booking. Creates
    (and, for gateway-backed methods, immediately processes) a refund for the
    tier amount — only if money was actually captured for this booking's
    group. Returns None if there's nothing to refund."""
    if not booking.refund_eligible or not booking.refund_percentage:
        return None
    payment = await repo.get_payment_by_group(db, booking.booking_group_id)
    if payment is None or payment.status != PaymentStatus.completed:
        return None
    # Base the tier on what was actually captured (payment.amount, which for
    # advance-payment bookings is less than total_amount) — _issue_refund then
    # caps it at the still-refundable balance.
    computed = payment.amount * Decimal(booking.refund_percentage) / Decimal(100)
    return await _issue_refund(
        db,
        booking=booking,
        payment=payment,
        requested_amount=computed,
        reason=booking.cancellation_reason or "Booking cancelled.",
        kind="cancellation",
    )


async def refund_reschedule_overpayment(
    db: AsyncSession, booking: Booking, amount: Decimal
) -> Refund | None:
    """Refund the overpaid difference when a booking is rescheduled to a
    cheaper slot than what was already captured. No-op if ``amount`` is
    non-positive or no completed payment exists for the group (e.g. a
    pending_approval bank-transfer booking, where nothing was captured yet).
    Unlike the cancellation refund this is a partial refund of an otherwise
    live booking, so it is not gated on ``refund_eligible``."""
    if amount <= 0:
        return None
    payment = await repo.get_payment_by_group(db, booking.booking_group_id)
    if payment is None or payment.status != PaymentStatus.completed:
        return None
    return await _issue_refund(
        db,
        booking=booking,
        payment=payment,
        requested_amount=amount,
        reason="Rescheduled to a lower-priced slot.",
        kind="reschedule overpayment",
    )


async def force_refund(db: AsyncSession, admin: User, booking_id: uuid.UUID) -> RefundResponse:
    """Admin force-majeure 100% refund regardless of the arena's tier policy
    (docs/11_BOOKING_ENGINE.md section 7)."""
    if admin.role != UserRole.admin:
        raise ForbiddenError("Only admins can force a refund.")
    booking = await booking_repo.get_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.")
    # Block a redundant re-refund of an already fully-refunded payment, but
    # allow a force refund to top up after a partial one (e.g. a reschedule
    # overpayment refund already took part of the captured amount).
    existing_payment = await repo.get_payment_by_group(db, booking.booking_group_id)
    if existing_payment is not None and existing_payment.status == PaymentStatus.completed:
        already = await repo.sum_refunds_for_payment(db, existing_payment.id)
        if already >= existing_payment.amount:
            raise ConflictError("This payment has already been fully refunded.")

    booking.refund_eligible = True
    booking.refund_percentage = 100
    if booking.status not in (BookingStatus.cancelled, BookingStatus.rejected):
        booking.status = BookingStatus.cancelled
        booking.cancellation_reason = "Force majeure — admin full refund."
        slot = await slot_repo.get_slot(db, booking.slot_id)
        if slot is not None and slot.status != SlotStatus.available:
            slot.status = SlotStatus.available
            await broadcast_slot_status(
                booking.court_id, slot.id, slot.date, slot.start_time, slot.status.value
            )
        await equipment_service.release_for_booking(db, booking.id)

    refund = await create_refund_for_cancelled_booking(db, booking)
    await db.commit()
    if refund is None:
        raise ValidationError("No completed payment exists for this booking to refund.")
    return RefundResponse.model_validate(refund)


async def _payment_visible_to(db: AsyncSession, user: User, payment: Payment) -> list[Booking]:
    """Authorize a read of a payment (receipt, event history): the paying
    player, an admin, or the owner of the arena the booking belongs to.
    Returns the payment's bookings so callers don't re-query them."""
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
    allowed = user.role == UserRole.admin or payment.player_id == user.id
    if not allowed and user.role == UserRole.owner and bookings:
        arena = await arena_repo.get_arena(db, bookings[0].arena_id)
        allowed = arena is not None and arena.owner_id == user.id
    if not allowed:
        raise ForbiddenError("You cannot view this payment.")
    return bookings


async def get_receipt_pdf(db: AsyncSession, user: User, payment_id: uuid.UUID) -> bytes:
    payment = await repo.get_payment(db, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.")
    bookings = await _payment_visible_to(db, user, payment)
    return build_receipt_pdf(payment, bookings)


async def list_payment_events(
    db: AsyncSession, user: User, payment_id: uuid.UUID
) -> list[PaymentEventResponse]:
    """The payment's lifecycle audit trail (created -> initiated -> paid ->
    confirmed -> …), oldest first. Same visibility rule as the receipt."""
    payment = await repo.get_payment(db, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.")
    await _payment_visible_to(db, user, payment)
    events = await repo.list_payment_events(db, payment_id)
    return [PaymentEventResponse.model_validate(e) for e in events]
