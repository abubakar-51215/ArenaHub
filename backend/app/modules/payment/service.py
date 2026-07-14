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
from app.modules.payment import repository as repo
from app.modules.payment.model import Payment, PaymentMethod, Refund, RefundStatus
from app.modules.payment.receipt import build_receipt_pdf
from app.modules.payment.schema import (
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    PaymentResponse,
    RefundResponse,
)
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus
from app.modules.user.model import User, UserRole
from app.shared.notify import notify_user
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
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
    payment.status = PaymentStatus.completed
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
        notify_user(booking.player_id, "booking_confirmed", booking_id=str(booking.id))
    arena = await arena_repo.get_arena(db, bookings[0].arena_id)
    if arena is not None:
        notify_user(arena.owner_id, "new_confirmed_booking", count=len(bookings))


async def _fail_group(db: AsyncSession, payment: Payment, *, rejected: bool) -> None:
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
    payment.status = PaymentStatus.failed
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
        notify_user(booking.player_id, "booking_payment_failed", booking_id=str(booking.id))


async def handle_webhook(
    db: AsyncSession, payment_method: str, payload: bytes, headers: dict
) -> None:
    provider = get_provider(payment_method)
    event = provider.verify_webhook(payload, headers)
    payment = await repo.get_payment_by_gateway_transaction_id(db, event.gateway_transaction_id)
    if payment is None:
        raise NotFoundError("Payment not found for this transaction.")
    if payment.status != PaymentStatus.pending:
        return  # already processed — webhooks can be retried by the gateway

    if event.status == "completed":
        await _confirm_group(db, payment)
    else:
        await _fail_group(db, payment, rejected=False)
    await db.commit()


async def dev_simulate_confirm(
    db: AsyncSession, user: User, payment_id: uuid.UUID, success: bool
) -> PaymentResponse:
    """Dev/test-only convenience to drive a payment to completion/failure
    without a real gateway webhook round trip. Mirrors the mocked provider
    simulation used when no gateway credentials are configured."""
    if not get_settings().is_dev:
        raise NotFoundError("Not found.")
    payment = await repo.get_payment(db, payment_id)
    if payment is None or payment.player_id != user.id:
        raise NotFoundError("Payment not found.")
    if payment.payment_method == PaymentMethod.bank_transfer:
        raise ValidationError("bank_transfer is confirmed by owner approval, not a webhook.")
    if payment.status != PaymentStatus.pending:
        raise ValidationError("This payment has already been resolved.")

    if success:
        await _confirm_group(db, payment)
    else:
        await _fail_group(db, payment, rejected=False)
    await db.commit()
    return PaymentResponse.model_validate(payment)


async def upload_receipt(
    db: AsyncSession, user: User, payment_id: uuid.UUID, receipt_proof_url: str
) -> PaymentResponse:
    payment = await repo.get_payment(db, payment_id)
    if payment is None or payment.player_id != user.id:
        raise NotFoundError("Payment not found.")
    if payment.payment_method != PaymentMethod.bank_transfer:
        raise ValidationError("Only bank_transfer payments take a receipt upload.")
    if payment.status != PaymentStatus.pending:
        raise ValidationError("This payment has already been resolved.")

    payment.receipt_proof_url = receipt_proof_url
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
    for booking in bookings:
        booking.status = BookingStatus.pending_approval
    await db.commit()
    return PaymentResponse.model_validate(payment)


async def _owned_bank_transfer_payment(
    db: AsyncSession, user: User, payment_id: uuid.UUID
) -> Payment:
    payment = await repo.get_payment(db, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.")
    if payment.payment_method != PaymentMethod.bank_transfer:
        raise ValidationError("Only bank_transfer payments require owner approval.")
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
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
    bookings = await booking_repo.list_group(db, payment.booking_group_id)
    for booking in bookings:
        booking.cancellation_reason = reason
    await _fail_group(db, payment, rejected=True)
    await db.commit()
    return PaymentResponse.model_validate(payment)


# ---- refunds --------------------------------------------------------------


async def create_refund_for_cancelled_booking(db: AsyncSession, booking: Booking) -> Refund | None:
    """Called by the booking module right after it cancels a booking. Creates
    (and, for gateway-backed methods, immediately processes) a refund for the
    amount the booking module already computed — only if money was actually
    captured for this booking's group. Returns None if there's nothing to
    refund (no completed payment, or refund_percentage is 0)."""
    if not booking.refund_eligible or not booking.refund_percentage:
        return None
    payment = await repo.get_payment_by_group(db, booking.booking_group_id)
    if payment is None or payment.status != PaymentStatus.completed:
        return None

    amount = (booking.total_amount * Decimal(booking.refund_percentage) / Decimal(100)).quantize(
        Decimal("0.01")
    )
    refund = Refund(
        booking_id=booking.id,
        payment_id=payment.id,
        amount=amount,
        reason=booking.cancellation_reason or "Booking cancelled.",
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
    notify_user(
        booking.player_id, "refund_initiated", booking_id=str(booking.id), amount=str(amount)
    )
    return refund


async def force_refund(db: AsyncSession, admin: User, booking_id: uuid.UUID) -> RefundResponse:
    """Admin force-majeure 100% refund regardless of the arena's tier policy
    (docs/11_BOOKING_ENGINE.md section 7)."""
    if admin.role != UserRole.admin:
        raise ForbiddenError("Only admins can force a refund.")
    booking = await booking_repo.get_booking(db, booking_id)
    if booking is None:
        raise NotFoundError("Booking not found.")

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

    refund = await create_refund_for_cancelled_booking(db, booking)
    await db.commit()
    if refund is None:
        raise ValidationError("No completed payment exists for this booking to refund.")
    return RefundResponse.model_validate(refund)


async def get_receipt_pdf(db: AsyncSession, user: User, payment_id: uuid.UUID) -> bytes:
    payment = await repo.get_payment(db, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.")
    bookings = await booking_repo.list_group(db, payment.booking_group_id)

    allowed = user.role == UserRole.admin or payment.player_id == user.id
    if not allowed and user.role == UserRole.owner and bookings:
        arena = await arena_repo.get_arena(db, bookings[0].arena_id)
        allowed = arena is not None and arena.owner_id == user.id
    if not allowed:
        raise ForbiddenError("You cannot view this receipt.")

    return build_receipt_pdf(payment, bookings)
