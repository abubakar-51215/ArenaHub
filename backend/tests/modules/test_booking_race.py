"""Real parallel bookings: eight players, eight separate database connections, one slot.

Most tests share one rolled-back session, which cannot show two transactions racing. This one
lets every request use the app's own engine (its own connection and transaction), so the slot
lock and the database row lock are really tested against each other. The rows are committed, so
the test empties the test database afterwards (only a database whose name ends in ``_test``).
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import redis as redis_cache
from app.core.config import get_settings
from app.database.session import SessionFactory, engine
from app.modules.booking.model import Booking
from app.modules.payment.model import Payment
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _make_bookable_court, _slots


@pytest_asyncio.fixture
async def committed_db() -> AsyncIterator[AsyncSession]:
    name = get_settings().database_url.rsplit("/", 1)[1]
    assert name.endswith("_test"), "this test empties its database; it runs only on *_test"
    await engine.dispose()  # connections from an earlier test belong to another event loop
    try:
        async with SessionFactory() as session:
            yield session
    finally:
        async with engine.begin() as conn:
            rows = await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
                    "AND tablename <> 'alembic_version'"
                )
            )
            tables = ", ".join(f'"{r[0]}"' for r in rows.all())
            await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
        await engine.dispose()


async def _clear_address_limits() -> None:
    # every call comes from one test address; the limits themselves are not changed
    await redis_cache.get_redis().delete("ratelimit:auth:127.0.0.1", "ratelimit:api:127.0.0.1")


async def test_eight_players_racing_for_one_slot_leave_exactly_one_booking(
    client: AsyncClient, committed_db: AsyncSession
) -> None:
    owner, _ = await make_user(client, committed_db, "race-owner@example.com", "owner")
    _, court, day = await _make_bookable_court(client, committed_db, owner, "race-owner")
    slot = (await _slots(client, court, day))[0]["id"]
    players = []
    for i in range(8):
        await _clear_address_limits()
        players.append((await make_user(client, committed_db, f"race-{i}@example.com"))[0])
    await _clear_address_limits()

    body = {"court_id": court, "slot_ids": [slot], "payment_type": "full"}
    answers = await asyncio.gather(
        *(client.post("/api/v1/bookings", headers=auth_header(p), json=body) for p in players)
    )
    codes = sorted(a.status_code for a in answers)
    assert codes.count(200) == 1, codes
    assert set(codes) <= {200, 409}, codes

    async with SessionFactory() as fresh:  # a new connection: what is really committed
        kept = await fresh.scalar(
            select(func.count()).select_from(Booking).where(Booking.slot_id == slot)
        )
    assert kept == 1


async def test_eight_parallel_payment_starts_for_one_booking_make_one_payment(
    client: AsyncClient, committed_db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A double tap or a retry storm on Pay must not create several payments for one booking.
    The provider call sits between "is there a payment already?" and saving the new one; it is
    made to take 0.3 s (a real gateway or network takes longer), so without the group lock every
    request passes the check before any saves (seen on a real server: 5 payments from 8 taps)."""
    from app.integrations.payments import get_provider as real_get_provider
    from app.modules.payment import service as payment_service

    class SlowProvider:
        def __init__(self, inner: Any) -> None:
            self.inner = inner

        async def initiate(self, **kwargs: Any) -> Any:
            await asyncio.sleep(0.3)
            return await self.inner.initiate(**kwargs)

    monkeypatch.setattr(
        payment_service, "get_provider", lambda method: SlowProvider(real_get_provider(method))
    )
    owner, _ = await make_user(client, committed_db, "pay-race-owner@example.com", "owner")
    _, court, day = await _make_bookable_court(client, committed_db, owner, "pay-race-owner")
    slot = (await _slots(client, court, day))[0]["id"]
    await _clear_address_limits()
    player, _ = await make_user(client, committed_db, "pay-race-player@example.com")
    await _clear_address_limits()
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court, "slot_ids": [slot], "payment_type": "full"},
    )
    group = booked.json()["data"]["booking_group_id"]

    body = {"booking_group_id": group, "payment_method": "bank_transfer"}
    answers = await asyncio.gather(
        *(
            client.post("/api/v1/payments/initiate", headers=auth_header(player), json=body)
            for _ in range(8)
        )
    )
    codes = sorted(a.status_code for a in answers)
    assert codes.count(200) == 1, codes
    assert set(codes) <= {200, 409}, codes

    async with SessionFactory() as fresh:
        made = await fresh.scalar(
            select(func.count()).select_from(Payment).where(Payment.booking_group_id == group)
        )
    assert made == 1
