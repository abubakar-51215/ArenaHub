"""Data access for courts and their peak-pricing rules.

Repository layer: queries and inserts only. Callers own the transaction.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.court.model import Court, CourtPricingRule


async def get_court(db: AsyncSession, court_id: uuid.UUID) -> Court | None:
    return await db.get(Court, court_id)


async def add_court(db: AsyncSession, court: Court) -> Court:
    db.add(court)
    await db.flush()
    return court


async def list_courts(
    db: AsyncSession, arena_id: uuid.UUID, *, available_only: bool = False
) -> list[Court]:
    stmt = select(Court).where(Court.arena_id == arena_id)
    if available_only:
        stmt = stmt.where(Court.is_available.is_(True))
    stmt = stmt.order_by(Court.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def count_courts(db: AsyncSession, arena_id: uuid.UUID) -> int:
    return (
        await db.scalar(select(func.count()).select_from(Court).where(Court.arena_id == arena_id))
        or 0
    )


async def get_pricing_rule(db: AsyncSession, rule_id: uuid.UUID) -> CourtPricingRule | None:
    return await db.get(CourtPricingRule, rule_id)


async def list_pricing_rules(db: AsyncSession, court_id: uuid.UUID) -> list[CourtPricingRule]:
    result = await db.execute(
        select(CourtPricingRule)
        .where(CourtPricingRule.court_id == court_id)
        .order_by(CourtPricingRule.created_at.asc())
    )
    return list(result.scalars().all())


async def add_pricing_rule(db: AsyncSession, rule: CourtPricingRule) -> CourtPricingRule:
    db.add(rule)
    await db.flush()
    return rule
