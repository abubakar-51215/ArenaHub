"""Data access for payments and refunds. Repository layer: queries and
inserts only. Callers own the transaction.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.arena.model import Arena
from app.modules.booking.model import Booking, BookingStatus, PaymentStatus
from app.modules.court.model import Court
from app.modules.payment.model import (
    Payment,
    PaymentEvent,
    PaymentLifecycleStatus,
    PaymentPurpose,
    Refund,
    RefundStatus,
)
from app.modules.user.model import User


async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Payment | None:
    return await db.get(Payment, payment_id)


async def get_payment_by_group(db: AsyncSession, booking_group_id: uuid.UUID) -> Payment | None:
    """The primary (initial ``booking``) payment for a group — what refunds
    draw against and receipts render. Balance top-ups are separate rows, found
    via ``get_pending_balance_payment``."""
    result = await db.execute(
        select(Payment)
        .where(
            Payment.booking_group_id == booking_group_id,
            Payment.purpose == PaymentPurpose.booking,
        )
        .order_by(Payment.created_at.desc())
    )
    return result.scalars().first()


async def get_pending_balance_payment(
    db: AsyncSession, booking_group_id: uuid.UUID
) -> Payment | None:
    result = await db.execute(
        select(Payment)
        .where(
            Payment.booking_group_id == booking_group_id,
            Payment.purpose == PaymentPurpose.balance,
            Payment.status == PaymentStatus.pending,
        )
        .order_by(Payment.created_at.desc())
    )
    return result.scalars().first()


async def list_balance_payments_for_group(
    db: AsyncSession, booking_group_id: uuid.UUID
) -> list[Payment]:
    """The balance top-ups of a group that went somewhere (not the ones that failed or ended
    unpaid), oldest first."""
    result = await db.execute(
        select(Payment)
        .where(
            Payment.booking_group_id == booking_group_id,
            Payment.purpose == PaymentPurpose.balance,
            Payment.status != PaymentStatus.failed,
        )
        .order_by(Payment.created_at.asc())
    )
    return list(result.scalars().all())


async def list_pending_balance_receipts_for_arenas(
    db: AsyncSession, arena_ids: list[uuid.UUID]
) -> list[tuple[Payment, Booking]]:
    """Balance receipts waiting for an owner's approval, oldest first, each with the first
    confirmed booking of its group (the booking itself stays confirmed meanwhile, so these never
    show in the booking-status approval queue)."""
    if not arena_ids:
        return []
    rows = await db.execute(
        select(Payment, Booking)
        .join(Booking, Booking.booking_group_id == Payment.booking_group_id)
        .where(
            Payment.purpose == PaymentPurpose.balance,
            Payment.status == PaymentStatus.pending,
            Payment.lifecycle_status == PaymentLifecycleStatus.pending_approval,
            Booking.arena_id.in_(arena_ids),
            Booking.status == BookingStatus.confirmed,
        )
        .order_by(Payment.created_at.asc(), Booking.start_time.asc())
    )
    seen: set[uuid.UUID] = set()
    out: list[tuple[Payment, Booking]] = []
    for payment, booking in rows.all():
        if payment.id not in seen:
            seen.add(payment.id)
            out.append((payment, booking))
    return out


async def list_stale_open_balance_payments(db: AsyncSession, cutoff: datetime) -> list[Payment]:
    """Balance payments started before ``cutoff`` that nothing finished: no receipt sent (a receipt
    with the owner is waiting on them, not on the player), so an abandoned card page or wallet
    request does not block the next attempt for ever."""
    result = await db.execute(
        select(Payment)
        .where(
            Payment.purpose == PaymentPurpose.balance,
            Payment.status == PaymentStatus.pending,
            Payment.receipt_proof_url.is_(None),
            Payment.created_at < cutoff,
        )
        .with_for_update()
    )
    return list(result.scalars().all())


async def list_completed_payments_for_group(
    db: AsyncSession, booking_group_id: uuid.UUID
) -> list[Payment]:
    """Every captured payment of a group (the first payment and any balance top-ups), newest
    first -- what a refund can be drawn from."""
    result = await db.execute(
        select(Payment)
        .where(
            Payment.booking_group_id == booking_group_id,
            Payment.status == PaymentStatus.completed,
        )
        .order_by(Payment.created_at.desc())
    )
    return list(result.scalars().all())


async def list_refunds_for_group(db: AsyncSession, booking_group_id: uuid.UUID) -> list[Refund]:
    """Every refund against any payment of the group (first payment and balance top-ups)."""
    result = await db.execute(
        select(Refund)
        .join(Payment, Payment.id == Refund.payment_id)
        .where(Payment.booking_group_id == booking_group_id)
        .order_by(Refund.created_at.asc())
    )
    return list(result.scalars().all())


async def list_payments_for_player(
    db: AsyncSession, player_id: uuid.UUID, *, offset: int, limit: int
) -> tuple[list[tuple[Payment, str | None, date | None]], int]:
    """A player's payments, newest first, enriched with (arena name, booking
    date) — both constant within a checkout group, so a limit-1 scalar
    subquery per group is enough."""
    arena_name = (
        select(Arena.name)
        .join(Booking, Booking.arena_id == Arena.id)
        .where(Booking.booking_group_id == Payment.booking_group_id)
        .limit(1)
        .scalar_subquery()
    )
    booking_date = (
        select(func.min(Booking.booking_date))
        .where(Booking.booking_group_id == Payment.booking_group_id)
        .scalar_subquery()
    )

    base = select(
        Payment, arena_name.label("arena_name"), booking_date.label("booking_date")
    ).where(Payment.player_id == player_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    result = await db.execute(base.order_by(Payment.created_at.desc()).offset(offset).limit(limit))
    return [(p, an, bd) for p, an, bd in result.all()], total


async def get_payment_by_gateway_transaction_id(
    db: AsyncSession, gateway_transaction_id: str
) -> Payment | None:
    result = await db.execute(
        select(Payment).where(Payment.gateway_transaction_id == gateway_transaction_id)
    )
    return result.scalar_one_or_none()


async def get_payment_by_gateway_transaction_id_for_update(
    db: AsyncSession, gateway_transaction_id: str
) -> Payment | None:
    result = await db.execute(
        select(Payment)
        .where(Payment.gateway_transaction_id == gateway_transaction_id)
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def get_payment_for_update(db: AsyncSession, payment_id: uuid.UUID) -> Payment | None:
    result = await db.execute(select(Payment).where(Payment.id == payment_id).with_for_update())
    return result.scalar_one_or_none()


async def add_payment(db: AsyncSession, payment: Payment) -> Payment:
    db.add(payment)
    await db.flush()
    return payment


async def add_refund(db: AsyncSession, refund: Refund) -> Refund:
    db.add(refund)
    await db.flush()
    return refund


async def sum_refunds_for_payment(db: AsyncSession, payment_id: uuid.UUID) -> Decimal:
    """Total refunded (pending + processed) against a payment — used to decide
    when a payment is fully refunded and its lifecycle should reflect it."""
    total = await db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0)).where(Refund.payment_id == payment_id)
    )
    return Decimal(total or 0)


async def list_refunds_for_payment(db: AsyncSession, payment_id: uuid.UUID) -> list[Refund]:
    result = await db.execute(
        select(Refund).where(Refund.payment_id == payment_id).order_by(Refund.created_at.asc())
    )
    return list(result.scalars().all())


async def list_payment_events(db: AsyncSession, payment_id: uuid.UUID) -> list[PaymentEvent]:
    result = await db.execute(
        select(PaymentEvent)
        .where(PaymentEvent.payment_id == payment_id)
        .order_by(PaymentEvent.created_at.asc())
    )
    return list(result.scalars().all())


# ---- owner dashboard revenue ----------------------------------------------
#
# Payment has no arena_id/court_id column — a checkout group's arena/court is
# reached via bookings.booking_group_id (see payment/model.py's docstring).
# arena_id/court_id are constant within a group (one /bookings call, one
# court), so grouping bookings by (booking_group_id, arena_id, court_id)
# yields one row per group with no aggregate needed — it's effectively a
# DISTINCT that also gives us the columns to join revenue against.


def _completed_revenue_query(
    arena_ids: list[uuid.UUID], date_from: datetime | None, date_to: datetime | None
) -> Select:
    group_arena = (
        select(
            Booking.booking_group_id.label("booking_group_id"),
            Booking.arena_id.label("arena_id"),
            Booking.court_id.label("court_id"),
        )
        .group_by(Booking.booking_group_id, Booking.arena_id, Booking.court_id)
        .subquery()
    )
    stmt = (
        select(
            Payment.amount,
            Payment.created_at.label("created_at"),
            group_arena.c.arena_id,
            group_arena.c.court_id,
        )
        .select_from(Payment)
        .join(group_arena, group_arena.c.booking_group_id == Payment.booking_group_id)
        .where(Payment.status == PaymentStatus.completed, group_arena.c.arena_id.in_(arena_ids))
    )
    if date_from is not None:
        stmt = stmt.where(Payment.created_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Payment.created_at < date_to)
    return stmt


async def sum_revenue_for_arenas(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Decimal:
    if not arena_ids:
        return Decimal("0")
    inner = _completed_revenue_query(arena_ids, date_from, date_to).subquery()
    total = await db.scalar(select(func.coalesce(func.sum(inner.c.amount), 0)))
    return Decimal(total or 0)


async def revenue_by_arena(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[tuple[uuid.UUID, Decimal]]:
    if not arena_ids:
        return []
    inner = _completed_revenue_query(arena_ids, date_from, date_to).subquery()
    result = await db.execute(
        select(inner.c.arena_id, func.sum(inner.c.amount)).group_by(inner.c.arena_id)
    )
    return [(arena_id, Decimal(amount)) for arena_id, amount in result.all()]


async def revenue_by_court(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[tuple[uuid.UUID, Decimal]]:
    if not arena_ids:
        return []
    inner = _completed_revenue_query(arena_ids, date_from, date_to).subquery()
    result = await db.execute(
        select(inner.c.court_id, func.sum(inner.c.amount)).group_by(inner.c.court_id)
    )
    return [(court_id, Decimal(amount)) for court_id, amount in result.all()]


async def revenue_by_day(
    db: AsyncSession,
    arena_ids: list[uuid.UUID],
    *,
    date_from: datetime,
    date_to: datetime,
) -> list[tuple[date, Decimal]]:
    """Completed-payment revenue summed per calendar day of payment, for the
    dashboard's revenue-trend chart."""
    if not arena_ids:
        return []
    inner = _completed_revenue_query(arena_ids, date_from, date_to).subquery()
    day = func.date(inner.c.created_at).label("day")
    result = await db.execute(select(day, func.sum(inner.c.amount)).group_by(day).order_by(day))
    return [(row_day, Decimal(amount)) for row_day, amount in result.all()]


async def list_refunds_for_owner(
    db: AsyncSession,
    owner_id: uuid.UUID | None,
    status: RefundStatus | None,
    *,
    arena_id: uuid.UUID | None = None,
    offset: int,
    limit: int,
) -> tuple[list[tuple[Refund, Payment, Booking, str, str, str]], int]:
    """Refunds on the owner's own arenas (every arena when ``owner_id`` is None, the admin's view),
    newest first, with the payment, booking, arena name and player name each row needs."""
    base = (
        select(Refund, Payment, Booking, Arena.name, User.full_name, Court.name)
        .join(Payment, Payment.id == Refund.payment_id)
        .join(Booking, Booking.id == Refund.booking_id)
        .join(Court, Court.id == Booking.court_id)
        .join(Arena, Arena.id == Booking.arena_id)
        .join(User, User.id == Booking.player_id)
    )
    if owner_id is not None:
        base = base.where(Arena.owner_id == owner_id)
    if status is not None:
        base = base.where(Refund.status == status)
    if arena_id is not None:
        base = base.where(Arena.id == arena_id)
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = await db.execute(base.order_by(Refund.created_at.desc()).offset(offset).limit(limit))
    return [(r, p, b, an, pn, cn) for r, p, b, an, pn, cn in rows.all()], total


async def get_refund_for_update(db: AsyncSession, refund_id: uuid.UUID) -> Refund | None:
    result = await db.execute(select(Refund).where(Refund.id == refund_id).with_for_update())
    return result.scalar_one_or_none()
