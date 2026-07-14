"""Data access for payments and refunds. Repository layer: queries and
inserts only. Callers own the transaction.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.payment.model import Payment, Refund


async def get_payment(db: AsyncSession, payment_id: uuid.UUID) -> Payment | None:
    return await db.get(Payment, payment_id)


async def get_payment_by_group(db: AsyncSession, booking_group_id: uuid.UUID) -> Payment | None:
    result = await db.execute(
        select(Payment)
        .where(Payment.booking_group_id == booking_group_id)
        .order_by(Payment.created_at.desc())
    )
    return result.scalars().first()


async def get_payment_by_gateway_transaction_id(
    db: AsyncSession, gateway_transaction_id: str
) -> Payment | None:
    result = await db.execute(
        select(Payment).where(Payment.gateway_transaction_id == gateway_transaction_id)
    )
    return result.scalar_one_or_none()


async def add_payment(db: AsyncSession, payment: Payment) -> Payment:
    db.add(payment)
    await db.flush()
    return payment


async def add_refund(db: AsyncSession, refund: Refund) -> Refund:
    db.add(refund)
    await db.flush()
    return refund


async def get_refund_for_booking(db: AsyncSession, booking_id: uuid.UUID) -> Refund | None:
    result = await db.execute(select(Refund).where(Refund.booking_id == booking_id))
    return result.scalars().first()
