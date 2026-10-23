"""Booking groups as the player sees them: one card per booking.

A booking made from several consecutive slots is stored as one row per slot
sharing a ``booking_group_id``. This module works on the whole group: the
grouped list, a cancel with the refund worked out once, a cancel preview, and a
reschedule that moves every slot together (with a price preview).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.cache.locking import acquire_slot_lock, release_slot_lock
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.booking import repository as repo
from app.modules.booking.model import Booking, BookingStatus, PaymentStatus
from app.modules.booking.schema import (
    BookingGroupDetails,
    CancelPreview,
    ReschedulePreview,
)
from app.modules.booking.service import (
    _CANCELLABLE,
    _RESCHEDULABLE,
    RESCHEDULE_NOTE,
    _apply_cancellation,
    _booking_start,
    _group_for_player,
    _was_rescheduled,
    booking_code_for,
    get_group_details,
    release_group,
)
from app.modules.court import repository as court_repo
from app.modules.equipment import repository as equipment_repo
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User
from app.shared.refunds import (
    describe_refund_policy,
    free_cancel_cutoff,
    resolve_refund_percentage,
)
from app.websocket.manager import broadcast_slot_status

_CENT = Decimal("0.01")
_ACTIVE = (BookingStatus.pending_payment, BookingStatus.pending_approval, BookingStatus.confirmed)


def _end(b: Booking) -> datetime:
    return datetime.combine(b.booking_date, b.end_time)


def _group_status(rows: list[Booking]) -> Booking:
    """The row that speaks for the group: a live one if any, else the first."""
    live = [b for b in rows if b.status in _ACTIVE]
    return (live or rows)[0]


def tab_of(rows: list[Booking], now: datetime) -> str:
    live = [b for b in rows if b.status in _ACTIVE]
    if live:
        return "upcoming" if max(_end(b) for b in live) > now else "past"
    if any(b.status == BookingStatus.completed for b in rows):
        return "past"
    return "cancelled"


async def list_groups(
    db: AsyncSession, user: User, tab: str, page: int, page_size: int
) -> tuple[list[dict], int]:
    """One item per booking group. Upcoming: soonest first. Past and cancelled:
    latest first. The server decides the tab (see ``tab_of``)."""
    rows, _ = await repo.list_player_bookings(db, user.id, status=None, offset=0, limit=5000)
    groups: dict[uuid.UUID, list[Booking]] = {}
    for b in rows:
        groups.setdefault(b.booking_group_id, []).append(b)
    now = datetime.now()
    picked = []
    for gid, items in groups.items():
        items.sort(key=lambda b: b.start_time)
        if tab_of(items, now) == tab:
            picked.append((gid, items))
    key = lambda g: (g[1][0].booking_date, g[1][0].start_time)  # noqa: E731
    picked.sort(key=key, reverse=tab != "upcoming")
    total = len(picked)
    window = picked[(page - 1) * page_size : page * page_size]

    out: list[dict] = []
    arenas: dict = {}
    courts: dict = {}
    for gid, items in window:
        first = _group_status(items)
        if first.arena_id not in arenas:
            arenas[first.arena_id] = await arena_repo.get_arena(db, first.arena_id)
        if first.court_id not in courts:
            courts[first.court_id] = await court_repo.get_court(db, first.court_id)
        arena, court = arenas[first.arena_id], courts[first.court_id]
        shown = [b for b in items if b.status in _ACTIVE] or items
        refund_amount, refund_status = await _refund_summary(db, gid)
        total_amount = sum((b.total_amount for b in shown), Decimal("0"))
        pay_now = sum((b.advance_amount for b in shown), Decimal("0"))
        out.append(
            {
                "booking_group_id": gid,
                "booking_code": booking_code_for(gid),
                "arena_id": first.arena_id,
                "arena_name": arena.name if arena else "",
                "arena_photo": (arena.images[0] if arena and arena.images else None),
                "court_id": first.court_id,
                "court_name": court.name if court else "",
                "sport": (court.sport_types[0] if court and court.sport_types else None),
                "booking_date": shown[0].booking_date,
                "start_time": shown[0].start_time,
                "end_time": shown[-1].end_time,
                "slot_count": len(shown),
                "status": first.status,
                "payment_status": first.payment_status,
                "total": total_amount,
                "pay_now": pay_now,
                "due_at_arena": total_amount - pay_now,
                "refund_amount": refund_amount,
                "refund_status": refund_status,
                "tab": tab,
                "booking_id": items[0].id,
                "my_rating": await _my_rating(db, items),
            }
        )
    return out, total


async def _my_rating(db: AsyncSession, rows: list[Booking]) -> int | None:
    from app.modules.review import repository as review_repo

    for b in rows:
        review = await review_repo.get_review_by_booking(db, b.id)
        if review is not None:
            return review.rating
    return None


async def _refund_summary(db: AsyncSession, group_id: uuid.UUID) -> tuple[Decimal, str | None]:
    from app.modules.payment import repository as payment_repo

    refunds = await payment_repo.list_refunds_for_group(db, group_id)
    if not refunds:
        return Decimal("0"), None
    states = {r.status.value for r in refunds}
    status = "failed" if "failed" in states else "pending" if "pending" in states else "processed"
    return sum((r.amount for r in refunds), Decimal("0")), status


async def _cancel_figures(
    db: AsyncSession, live: list[Booking], arena: Any
) -> tuple[int, Decimal, Decimal]:
    """(refund percentage, paid share, refund amount) for cancelling ``live`` now."""
    from app.modules.payment import repository as payment_repo

    if all(b.status == BookingStatus.pending_payment for b in live):
        return 0, Decimal("0"), Decimal("0")
    from app.modules.payment import service as payment_service

    waiting = await payment_service.receipt_waiting_payment(db, live)
    if waiting is not None:
        # a receipt is with the arena: the money may have arrived, so all of it comes back
        siblings = await repo.list_group(db, live[0].booking_group_id)
        group_adv = sum((b.advance_amount for b in siblings), Decimal("0"))
        live_adv = sum((b.advance_amount for b in live), Decimal("0"))
        share = live_adv / group_adv if group_adv > 0 else Decimal("1")
        full = (waiting.amount * share).quantize(_CENT)
        return 100, full, full
    hours = Decimal((_booking_start(live[0]) - datetime.now()).total_seconds()) / 3600
    pct = resolve_refund_percentage(arena.refund_policy if arena else [], max(hours, Decimal("0")))
    payments = await payment_repo.list_completed_payments_for_group(db, live[0].booking_group_id)
    if not payments:
        return pct, Decimal("0"), Decimal("0")
    siblings = await repo.list_group(db, live[0].booking_group_id)
    group_adv = sum((b.advance_amount for b in siblings), Decimal("0"))
    live_adv = sum((b.advance_amount for b in live), Decimal("0"))
    share = live_adv / group_adv if group_adv > 0 else Decimal("1")
    captured = sum((p.amount for p in payments), Decimal("0"))
    paid = (captured * share).quantize(_CENT)
    refundable = Decimal("0")
    for p in payments:
        refundable += p.amount - await payment_repo.sum_refunds_for_payment(db, p.id)
    amount = min(paid * Decimal(pct) / Decimal(100), refundable).quantize(_CENT)
    return pct, paid, max(amount, Decimal("0"))


async def cancel_preview(db: AsyncSession, user: User, group_id: uuid.UUID) -> CancelPreview:
    rows = await _group_for_player(db, user, group_id)
    arena = await arena_repo.get_arena(db, rows[0].arena_id)
    live = [b for b in rows if b.status in _CANCELLABLE]
    policy = describe_refund_policy(arena.refund_policy if arena else [], _booking_start(rows[0]))
    if not live or _booking_start(live[0]) <= datetime.now():
        return CancelPreview(
            can_cancel=False, paid=Decimal("0"), refund_percentage=0, refund_amount=Decimal("0"),
            policy_text=policy,
        )  # fmt: skip
    pct, paid, amount = await _cancel_figures(db, live, arena)
    from app.modules.payment import service as payment_service

    waiting = await payment_service.receipt_waiting_payment(db, live) is not None
    return CancelPreview(
        can_cancel=True,
        paid=paid,
        refund_percentage=pct,
        refund_amount=amount,
        policy_text=policy,
        receipt_waiting=waiting,
    )


async def cancel_group(
    db: AsyncSession, user: User, group_id: uuid.UUID, reason: str | None
) -> BookingGroupDetails:
    """Cancel every live booking of the group in one go and refund once: the
    arena policy percentage of what was paid, never more than was paid."""
    await _group_for_player(db, user, group_id)
    locked = await repo.list_group_for_update(db, group_id)
    live = [b for b in locked if b.status in _CANCELLABLE]
    if not live:
        raise ValidationError("This booking has nothing left to cancel.")
    if _booking_start(live[0]) <= datetime.now():
        raise ValidationError("Cannot cancel a booking that has already started.")
    if all(b.status == BookingStatus.pending_payment for b in live):
        return await release_group(db, user, group_id)

    arena = await arena_repo.get_arena(db, live[0].arena_id)
    pct, _, _ = await _cancel_figures(db, live, arena)
    from app.modules.payment import service as payment_service

    receipt_waiting = await payment_service.receipt_waiting_payment(db, live) is not None
    # one booking is one event for the player: one "Booking cancelled", whatever the hours
    for i, b in enumerate(live):
        await _apply_cancellation(
            db, b, reason=reason, refund_percentage=pct, refund=False, notify=i == 0
        )
    from app.modules.payment import service as payment_service

    if receipt_waiting:
        await payment_service.create_refund_for_waiting_receipt(db, live, reason)
    else:
        await payment_service.create_refund_for_cancelled_group(db, live, pct, reason)
    await _close_pending_payment(db, group_id, "Booking cancelled by the player.")
    await payment_service.close_open_balance_payment(db, live[0], reason)
    await db.commit()
    return await get_group_details(db, user, group_id)


async def _close_pending_payment(db: AsyncSession, group_id: uuid.UUID, note: str) -> None:
    from app.modules.payment import repository as payment_repo
    from app.modules.payment import state_machine
    from app.modules.payment.model import PaymentLifecycleStatus as Lifecycle

    payment = await payment_repo.get_payment_by_group(db, group_id)
    if payment is not None and payment.status == PaymentStatus.pending:
        payment.status = PaymentStatus.failed
        await state_machine.advance(db, payment, Lifecycle.expired, note=note)


# ---------------------------------------------------------------- reschedule


async def _plan_reschedule(
    db: AsyncSession, user: User, group_id: uuid.UUID, new_slot_ids: list[uuid.UUID]
) -> Any:
    rows = await _group_for_player(db, user, group_id)
    live = sorted((b for b in rows if b.status in _CANCELLABLE), key=lambda b: b.start_time)
    if not live or any(b.status not in _RESCHEDULABLE for b in live):
        raise ValidationError("This booking cannot be rescheduled.")
    if _booking_start(live[0]) <= datetime.now():
        raise ValidationError("Cannot reschedule a booking that has already started.")
    arena = await arena_repo.get_arena(db, live[0].arena_id)
    if datetime.now() >= free_cancel_cutoff(
        arena.refund_policy if arena else [], _booking_start(live[0])
    ):
        raise ValidationError("It is too late to reschedule this booking.")
    from app.modules.payment import repository as payment_repo

    payment = await payment_repo.get_payment_by_group(db, group_id)
    if await _was_rescheduled(db, payment):
        raise ValidationError("A booking can be rescheduled only once.")

    ids = list(dict.fromkeys(new_slot_ids))
    if len(ids) != len(live):
        raise ValidationError(f"Choose exactly {len(live)} consecutive time(s) on the same court.")
    slots: list[TimeSlot] = []
    for sid in ids:
        slot = await slot_repo.get_slot(db, sid)
        if slot is None or slot.court_id != live[0].court_id:
            raise NotFoundError("Slot not found.")
        slots.append(slot)
    slots.sort(key=lambda s: (s.date, s.start_time))
    if len({s.date for s in slots}) > 1 or any(
        slots[i].end_time != slots[i + 1].start_time for i in range(len(slots) - 1)
    ):
        raise ValidationError("Choose consecutive times on the same day.")
    if datetime.combine(slots[0].date, slots[0].start_time) <= datetime.now():
        raise ValidationError("Choose a time that has not started yet.")
    if {s.id for s in slots} == {b.slot_id for b in live}:
        raise ValidationError("This is already the booked time.")
    own = {b.slot_id for b in live}
    if any(s.status != SlotStatus.available and s.id not in own for s in slots):
        raise ConflictError("One of the chosen times is no longer available.")

    equipment_total = Decimal("0")
    for b in live:
        for line in await equipment_repo.list_booking_equipment(db, b.id):
            equipment_total += line.total_price
    old_total = sum((b.total_amount for b in live), Decimal("0"))
    new_total = sum((s.price for s in slots), Decimal("0")) + equipment_total
    paid = sum((b.total_amount - b.remaining_amount for b in live), Decimal("0"))
    captured = payment is not None and payment.status == PaymentStatus.completed
    figures = ReschedulePreview(
        old_total=old_total.quantize(_CENT),
        new_total=new_total.quantize(_CENT),
        paid=paid.quantize(_CENT),
        balance=max(new_total - paid, Decimal("0")).quantize(_CENT),
        refund=(max(paid - new_total, Decimal("0")) if captured else Decimal("0")).quantize(_CENT),
    )
    return live, slots, equipment_total, payment, figures


async def reschedule_preview(
    db: AsyncSession, user: User, group_id: uuid.UUID, new_slot_ids: list[uuid.UUID]
) -> ReschedulePreview:
    *_, figures = await _plan_reschedule(db, user, group_id, new_slot_ids)
    return figures


async def reschedule_group(
    db: AsyncSession, user: User, group_id: uuid.UUID, new_slot_ids: list[uuid.UUID]
) -> BookingGroupDetails:
    """Move every slot of the booking to new consecutive times on the same court.
    The price is re-worked from the new slots: more than was paid leaves a balance
    for the arena, less is refunded."""
    await _group_for_player(db, user, group_id)
    await repo.list_group_for_update(db, group_id)
    live, slots, equipment_total, payment, fig = await _plan_reschedule(
        db, user, group_id, new_slot_ids
    )
    acquired: list[tuple[str, str]] = []
    try:
        for s in slots:
            ok, key, token = await acquire_slot_lock(live[0].court_id, s.date, s.start_time)
            if not ok:
                raise ConflictError("One of the chosen times is being booked right now.")
            acquired.append((key, token))
        own = {b.slot_id for b in live}
        fresh = []
        for s in slots:
            f = await slot_repo.get_slot_for_update(db, s.id)
            if f is None or (f.status != SlotStatus.available and f.id not in own):
                raise ConflictError("One of the chosen times is no longer available.")
            fresh.append(f)
        old_slots = [await slot_repo.get_slot(db, b.slot_id) for b in live]
        carried = next((o.status for o in old_slots if o is not None), SlotStatus.reserved)
        for o in old_slots:
            if o is not None:
                o.status = SlotStatus.available
        for f in fresh:
            f.status = carried

        pool = fig.paid
        for i, (b, f) in enumerate(zip(live, fresh, strict=True)):
            total = f.price + (equipment_total if i == 0 else Decimal("0"))
            adv = min(total, pool)
            pool -= adv
            b.slot_id, b.booking_date = f.id, f.date
            b.start_time, b.end_time = f.start_time, f.end_time
            b.total_amount, b.advance_amount = total, adv
            b.remaining_amount = total - adv
        if fig.refund > 0:
            from app.modules.payment.service import refund_reschedule_overpayment

            await refund_reschedule_overpayment(db, live[0], fig.refund)
        if payment is not None:
            from app.modules.payment import state_machine

            await state_machine.record_note(
                db, payment, f"{RESCHEDULE_NOTE} Balance {fig.balance}, refund {fig.refund}."
            )
        # a match on this booking moves with it
        from app.modules.match.service import follow_booking_moved

        await follow_booking_moved(db, group_id)
        await db.commit()
        touched = {o.id: o for o in old_slots if o is not None} | {f.id: f for f in fresh}
        for t in touched.values():
            await broadcast_slot_status(
                live[0].court_id, t.id, t.date, t.start_time, t.status.value
            )
    finally:
        for key, token in acquired:
            await release_slot_lock(key, token)
    return await get_group_details(db, user, group_id)
