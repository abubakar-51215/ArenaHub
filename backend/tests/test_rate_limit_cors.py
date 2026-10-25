"""Rate-limit responses must carry CORS headers and Retry-After must be readable.

A browser only sees a 429 as a 429 if the response has the CORS headers. The
limiter used to sit outside the CORS middleware, so its 429s had none and the
browser reported a CORS failure instead.
"""

from collections.abc import Iterator
from types import ModuleType

import pytest
from httpx import AsyncClient

from app.core.config import Settings, get_settings

ORIGIN = "http://localhost:3000"
# An empty body fails validation before any database work, so the test needs
# no database. The limiter still counts it.
INVALID_BODY: dict = {}


def test_default_budgets_are_unchanged() -> None:
    fields = Settings.model_fields
    assert fields["rate_limit_auth_per_minute"].default == 20
    assert fields["rate_limit_api_per_minute"].default == 100


async def test_rate_limited_response_carries_cors_and_retry_after(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)

    responses = [
        await client.post("/api/v1/auth/login", json=INVALID_BODY, headers={"Origin": ORIGIN})
        for _ in range(3)
    ]

    assert [r.status_code for r in responses[:2]] == [422, 422]
    limited = responses[2]
    assert limited.status_code == 429
    assert limited.headers["access-control-allow-origin"] == ORIGIN
    assert int(limited.headers["retry-after"]) >= 1
    assert "retry-after" in limited.headers["access-control-expose-headers"].lower()


async def test_dev_allows_expo_web_origin_and_nothing_else(client: AsyncClient) -> None:
    for origin, allowed in (("http://localhost:8081", True), ("http://evil.example", False)):
        res = await client.options(
            "/api/v1/auth/login",
            headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
        )
        assert (res.headers.get("access-control-allow-origin") == origin) is allowed


# --- whose address is counted ---------------------------------------------------
# The test client connects from 127.0.0.1.


async def _three_logins(client: AsyncClient, forwarded: list[str]) -> list[int]:
    return [
        (
            await client.post(
                "/api/v1/auth/login", json=INVALID_BODY, headers={"X-Forwarded-For": f}
            )
        ).status_code
        for f in forwarded
    ]


async def test_spoofed_forwarded_header_is_ignored_by_default(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    monkeypatch.setattr(get_settings(), "trusted_proxies", "")
    # a new made-up address on every request does not buy a new budget
    codes = await _three_logins(client, ["1.1.1.1", "2.2.2.2", "3.3.3.3"])
    assert codes == [422, 422, 429]


async def test_forwarded_header_is_honoured_only_from_a_trusted_proxy(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    monkeypatch.setattr(get_settings(), "trusted_proxies", "10.9.0.0/16, 127.0.0.1")
    # three real clients behind the proxy: three budgets
    assert await _three_logins(client, ["4.4.4.1", "4.4.4.2", "4.4.4.3"]) == [422, 422, 422]
    # one client, its third request is limited
    assert await _three_logins(client, ["4.4.4.9"] * 3) == [422, 422, 429]
    # a client cannot hide behind addresses it writes itself: the right-most
    # untrusted hop counts, whatever is written to the left of it
    codes = await _three_logins(
        client, ["8.8.8.1, 5.5.5.5", "8.8.8.2, 5.5.5.5", "8.8.8.3, 5.5.5.5, 10.9.1.1"]
    )
    assert codes == [422, 422, 429]


async def test_malformed_forwarded_header_never_crashes_or_bypasses(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    monkeypatch.setattr(get_settings(), "trusted_proxies", "127.0.0.1")
    bad = ["not-an-ip", "999.1.1.1, ,", "::zz, <script>"]
    # every malformed header falls back to the proxy's own address: one shared budget
    assert await _three_logins(client, bad) == [422, 422, 429]


def test_trusted_proxies_reads_addresses_and_ranges_and_skips_junk() -> None:
    s = Settings(TRUSTED_PROXIES="10.0.0.5, 10.1.0.0/16, ::1, nonsense")
    assert [str(n) for n in s.trusted_proxy_networks] == ["10.0.0.5/32", "10.1.0.0/16", "::1/128"]
    assert Settings.model_fields["trusted_proxies"].default == ""


@pytest.fixture
def fallback() -> Iterator[ModuleType]:
    from app.middleware import rate_limit

    rate_limit._fallback_counts.clear()
    yield rate_limit
    rate_limit._fallback_counts.clear()


def test_fallback_counter_limits_per_key_and_resets_after_the_window(fallback: ModuleType) -> None:
    hit = fallback._fallback_hit
    assert [hit("a", 5, now=0.0)[0] for _ in range(3)] == [1, 2, 3]
    assert hit("b", 5, now=1.0)[0] == 1
    assert hit("a", 5, now=10.0) == (4, 50)
    assert hit("a", 5, now=fallback.WINDOW_SECONDS + 1.0)[0] == 1


def test_full_table_of_live_windows_refuses_new_addresses_and_keeps_every_counter(
    fallback: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fallback, "_FALLBACK_MAX_KEYS", 3)
    for i in range(3):
        fallback._fallback_hit(f"k{i}", 5, now=float(i))
    before = dict(fallback._fallback_counts)

    count, left = fallback._fallback_hit("newcomer", 5, now=10.0)

    assert count > 5  # fail closed: refused, not waved through
    assert left == fallback.WINDOW_SECONDS - 10  # until the oldest window ends
    assert fallback._fallback_counts == before  # nobody's counter was dropped or reset
    assert fallback._fallback_hit("k0", 5, now=11.0)[0] == 2  # known addresses still count


def test_full_table_makes_room_by_pruning_only_expired_windows(
    fallback: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(fallback, "_FALLBACK_MAX_KEYS", 3)
    fallback._fallback_hit("old1", 5, now=0.0)
    fallback._fallback_hit("old2", 5, now=1.0)
    fallback._fallback_hit("live", 5, now=50.0)

    count, _ = fallback._fallback_hit("newcomer", 5, now=61.0)  # old1 and old2 have expired

    assert count == 1
    assert set(fallback._fallback_counts) == {"live", "newcomer"}


class _Redis:
    """A Redis whose incr works and whose other calls can be made to fail."""

    def __init__(self, count: int, ttl_fails: bool = False, expire_fails: bool = False) -> None:
        self.count, self.ttl_fails, self.expire_fails = count, ttl_fails, expire_fails
        self.expired: list[str] = []

    async def incr(self, key: str) -> int:
        return self.count

    async def expire(self, key: str, seconds: int) -> None:
        if self.expire_fails:
            raise ConnectionError("expire failed")
        self.expired.append(key)

    async def ttl(self, key: str) -> int:
        if self.ttl_fails:
            raise ConnectionError("ttl failed")
        return 42


async def _login_with(client: AsyncClient, monkeypatch: pytest.MonkeyPatch, redis: _Redis) -> int:
    from app.cache import redis as redis_cache

    monkeypatch.setattr(redis_cache, "get_redis", lambda: redis)
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    return (await client.post("/api/v1/auth/login", json=INVALID_BODY)).status_code


async def test_over_limit_request_stays_refused_when_ttl_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, fallback: ModuleType
) -> None:
    redis = _Redis(count=7, ttl_fails=True)
    assert await _login_with(client, monkeypatch, redis) == 429  # not reset to a count of one
    assert fallback._fallback_counts == {}  # and Redis, not memory, did the counting


async def test_first_request_is_allowed_and_counted_when_expire_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, fallback: ModuleType
) -> None:
    assert await _login_with(client, monkeypatch, _Redis(count=1, expire_fails=True)) == 422


async def test_over_limit_request_stays_refused_when_expire_repair_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, fallback: ModuleType
) -> None:
    class NoExpiry(_Redis):
        async def ttl(self, key: str) -> int:
            return -1  # the counter lost its expiry

    assert await _login_with(client, monkeypatch, NoExpiry(3, expire_fails=True)) == 429


async def test_a_counter_without_an_expiry_is_given_one(fallback: ModuleType) -> None:
    class NoExpiry(_Redis):
        async def ttl(self, key: str) -> int:
            return -1

    redis = NoExpiry(3)
    left = await fallback._seconds_left(redis, "k")
    assert left == fallback.WINDOW_SECONDS and redis.expired == ["k"]


async def test_requests_are_still_limited_while_redis_is_down(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch, fallback: ModuleType
) -> None:
    from app.cache import redis as redis_cache

    def broken() -> None:
        raise ConnectionError("redis is down")

    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    monkeypatch.setattr(redis_cache, "get_redis", broken)

    codes = [
        (await client.post("/api/v1/auth/login", json=INVALID_BODY)).status_code for _ in range(3)
    ]

    assert codes == [422, 422, 429]


def test_an_outage_is_logged_once_and_its_end_is_logged_once() -> None:
    from structlog.testing import capture_logs

    from app.core.outage_log import OutageLog

    outage = OutageLog("thing")
    with capture_logs() as logs:
        for _ in range(50):
            outage.failed(ConnectionError("down"))
        outage.ok()
        outage.ok()
        outage.failed(TimeoutError())
    assert [(e["event"], e["log_level"]) for e in logs] == [
        ("thing_unavailable", "warning"),
        ("thing_recovered", "info"),
        ("thing_unavailable", "warning"),
    ]
    assert logs[2]["error"] == "TimeoutError"
