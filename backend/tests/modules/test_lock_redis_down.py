"""When the lock service (Redis) cannot be reached, a booking is refused with a plain "try again"
and nothing is booked; it is never a 500 and never a booking made without the lock. Found by the
end-to-end QA run (scripts/qa_redis_down.mjs)."""

import types
import uuid
from datetime import date, time

import pytest
from httpx import AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import locking
from app.core import messages
from app.core.exceptions import ServiceUnavailableError
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _make_bookable_court, _slots


class _DeadRedis:
    async def set(self, *args: object, **kwargs: object) -> None:
        raise RedisConnectionError("down")

    async def get(self, *args: object, **kwargs: object) -> None:
        raise RedisConnectionError("down")


def _redis_is_down(monkeypatch: pytest.MonkeyPatch) -> None:
    # only the lock module sees the dead Redis; the rest of the app keeps its normal one
    monkeypatch.setattr(
        locking, "redis_cache", types.SimpleNamespace(get_redis=lambda: _DeadRedis())
    )


async def test_taking_the_lock_without_redis_says_try_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _redis_is_down(monkeypatch)
    with pytest.raises(ServiceUnavailableError) as err:
        await locking.acquire_slot_lock(uuid.uuid4(), date.today(), time(18, 0))
    assert err.value.message == messages.BOOKING_TEMPORARILY_UNAVAILABLE


async def test_releasing_the_lock_without_redis_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _redis_is_down(monkeypatch)
    await locking.release_slot_lock("lock:x", "token")  # the lock expires by itself


async def test_a_booking_without_redis_is_503_and_books_nothing(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner, _ = await make_user(client, db_session, "norediso@example.com", "owner")
    _, court, day = await _make_bookable_court(client, db_session, owner, "norediso")
    slot = (await _slots(client, court, day))[0]["id"]
    player, _ = await make_user(client, db_session, "noredisp@example.com")

    _redis_is_down(monkeypatch)
    res = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court, "slot_ids": [slot], "payment_type": "full"},
    )
    assert res.status_code == 503, res.text
    assert res.json()["message"] == messages.BOOKING_TEMPORARILY_UNAVAILABLE

    monkeypatch.undo()
    assert (await _slots(client, court, day))[0]["status"] == "available"  # nothing was held


async def test_a_signed_in_request_without_redis_is_503_not_500(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The sign-out list lives in Redis. With it unreachable a signed-out token cannot be told
    from a good one, so the request is refused (closed), but as "not available", not a 500."""
    from app.modules.auth import tokens

    player, _ = await make_user(client, db_session, "norediss@example.com")
    monkeypatch.setattr(
        tokens, "redis_cache", types.SimpleNamespace(get_redis=lambda: _DeadRedis())
    )

    class _Exists(_DeadRedis):
        async def exists(self, *args: object) -> None:
            raise RedisConnectionError("down")

    monkeypatch.setattr(tokens, "redis_cache", types.SimpleNamespace(get_redis=lambda: _Exists()))
    res = await client.get("/api/v1/users/me", headers=auth_header(player))
    assert res.status_code == 503, res.text
