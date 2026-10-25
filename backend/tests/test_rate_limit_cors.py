"""Rate-limit responses must carry CORS headers and Retry-After must be readable.

A browser only sees a 429 as a 429 if the response has the CORS headers. The
limiter used to sit outside the CORS middleware, so its 429s had none and the
browser reported a CORS failure instead.
"""

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


def test_fallback_counter_limits_per_key_and_resets_after_the_window() -> None:
    from app.middleware import rate_limit

    rate_limit._fallback_counts.clear()
    assert [rate_limit._fallback_hit("a", now=0.0)[0] for _ in range(3)] == [1, 2, 3]
    assert rate_limit._fallback_hit("b", now=1.0)[0] == 1
    count, left = rate_limit._fallback_hit("a", now=10.0)
    assert (count, left) == (4, 50)
    assert rate_limit._fallback_hit("a", now=rate_limit.WINDOW_SECONDS + 1.0)[0] == 1
    rate_limit._fallback_counts.clear()


async def test_requests_are_still_limited_while_redis_is_down(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.cache import redis as redis_cache
    from app.middleware import rate_limit

    def broken() -> None:
        raise ConnectionError("redis is down")

    rate_limit._fallback_counts.clear()
    monkeypatch.setattr(get_settings(), "rate_limit_auth_per_minute", 2)
    monkeypatch.setattr(redis_cache, "get_redis", broken)

    codes = [
        (await client.post("/api/v1/auth/login", json=INVALID_BODY)).status_code for _ in range(3)
    ]
    rate_limit._fallback_counts.clear()

    assert codes == [422, 422, 429]
