"""Payment lifecycle state machine.

Defines the legal ``PaymentLifecycleStatus`` transitions and the single entry
point (``advance``) used to move a payment from one lifecycle state to the
next. Every successful transition appends a ``PaymentEvent`` audit row, so the
full history of a payment is reconstructable after the fact.

This governs the *fine-grained* lifecycle only; the coarse ``Payment.status``
(pending/completed/failed/refunded) that drives booking confirmation and
revenue queries is still set explicitly by the service alongside these calls.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.payment.model import Payment, PaymentEvent
from app.modules.payment.model import PaymentLifecycleStatus as Lifecycle

# Legal forward transitions. Terminal states (failed/expired/rejected/
# refunded) have no outgoing edges. Kept deliberately permissive on the
# "in-flight" states so a future real PSP can use processing/expired without
# reworking this table.
ALLOWED_TRANSITIONS: dict[Lifecycle, frozenset[Lifecycle]] = {
    Lifecycle.pending: frozenset(
        {
            Lifecycle.initiated,
            Lifecycle.processing,
            Lifecycle.pending_approval,
            Lifecycle.paid,
            Lifecycle.failed,
            Lifecycle.expired,
        }
    ),
    Lifecycle.initiated: frozenset(
        {Lifecycle.processing, Lifecycle.paid, Lifecycle.failed, Lifecycle.expired}
    ),
    Lifecycle.processing: frozenset({Lifecycle.paid, Lifecycle.failed, Lifecycle.expired}),
    Lifecycle.pending_approval: frozenset({Lifecycle.paid, Lifecycle.rejected, Lifecycle.expired}),
    Lifecycle.paid: frozenset({Lifecycle.confirmed, Lifecycle.refunded}),
    Lifecycle.confirmed: frozenset({Lifecycle.refunded}),
    Lifecycle.failed: frozenset(),
    Lifecycle.expired: frozenset(),
    Lifecycle.rejected: frozenset(),
    Lifecycle.refunded: frozenset(),
}


class InvalidTransitionError(Exception):
    """Raised when a payment is asked to move to a state its current state
    can't legally reach — a programming error, not a user-facing one."""


def can_transition(current: Lifecycle, target: Lifecycle) -> bool:
    return target in ALLOWED_TRANSITIONS.get(current, frozenset())


async def advance(
    db: AsyncSession, payment: Payment, target: Lifecycle, *, note: str | None = None
) -> PaymentEvent | None:
    """Move ``payment`` to ``target`` lifecycle status and record the audit
    event. A no-op (returns None) if the payment is already in ``target`` —
    which keeps webhook/idempotent retries from raising. Raises
    ``InvalidTransitionError`` for an illegal move."""
    current = payment.lifecycle_status
    if current == target:
        return None
    if not can_transition(current, target):
        raise InvalidTransitionError(f"Cannot move payment from {current} to {target}.")
    payment.lifecycle_status = target
    event = PaymentEvent(payment_id=payment.id, from_status=current, to_status=target, note=note)
    db.add(event)
    return event


async def record_created(db: AsyncSession, payment: Payment, *, note: str | None = None) -> None:
    """Record the initial creation event for a freshly-inserted payment
    (whose lifecycle_status is its starting state, with no prior state)."""
    db.add(
        PaymentEvent(
            payment_id=payment.id,
            from_status=None,
            to_status=payment.lifecycle_status,
            note=note or "Payment created.",
        )
    )


async def record_note(db: AsyncSession, payment: Payment, note: str) -> PaymentEvent:
    """Append an annotation event to the audit trail without changing the
    lifecycle state — used for things that are part of the payment's history
    but aren't state transitions, e.g. a partial refund. ``from_status`` and
    ``to_status`` are both the current state so the row is unambiguous."""
    current = payment.lifecycle_status
    event = PaymentEvent(
        payment_id=payment.id, from_status=current, to_status=current, note=note
    )
    db.add(event)
    return event
