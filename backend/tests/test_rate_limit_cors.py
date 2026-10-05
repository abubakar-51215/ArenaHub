"""Rate-limit responses must carry CORS headers and Retry-After must be readable.

A browser only sees a 429 as a 429 if the response has the CORS headers. The
limiter used to sit outside the CORS middleware, so its 429s had none and the
browser reported a CORS failure instead.
"""

from app.core.config import Settings, get_settings

ORIGIN = "http://localhost:3000"
# An empty body fails validation before any database work, so the test needs
# no database. The limiter still counts it.
INVALID_BODY: dict = {}


def test_default_budgets_are_unchanged():
    fields = Settings.model_fields
    assert fields["rate_limit_auth_per_minute"].default == 20
    assert fields["rate_limit_api_per_minute"].default == 100


async def test_rate_limited_response_carries_cors_and_retry_after(client, monkeypatch):
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
