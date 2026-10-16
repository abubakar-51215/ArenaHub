"""Checkout pieces for the mobile booking flow: the four payment methods and
their states, the card "not available yet" answer, the price preview, the
booking-group details and leaving checkout (release)."""

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _create_booking_group, _make_bookable_court, _slots

pytestmark = pytest.mark.real_gateway_rules


async def _setup(client: AsyncClient, db: AsyncSession, tag: str) -> Any:
    owner, _ = await make_user(client, db, f"co-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"cp-{tag}@example.com", "player")
    arena_id, court_id, day = await _make_bookable_court(client, db, owner, f"co-{tag}")
    return owner, player, arena_id, court_id, day


async def test_card_with_placeholder_or_empty_key_is_a_clean_503(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k1")
    slots = await _slots(client, court_id, day)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])
    for key in ("sk_test_xxx", "", None):
        monkeypatch.setattr(get_settings(), "stripe_secret_key", key)
        resp = await client.post(
            "/api/v1/payments/initiate",
            headers=auth_header(player),
            json={"booking_group_id": group_id, "payment_method": "card"},
        )
        assert resp.status_code == 503
        assert resp.json()["message"] == "Card payments are not available yet."


async def test_wallets_are_coming_soon_and_refuse_to_start(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k2")
    slots = await _slots(client, court_id, day)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])
    for method in ("jazzcash", "easypaisa"):
        resp = await client.post(
            "/api/v1/payments/initiate",
            headers=auth_header(player),
            json={"booking_group_id": group_id, "payment_method": method},
        )
        assert resp.status_code == 503
        assert "coming soon" in resp.json()["message"]


async def test_methods_list_has_exactly_four_in_order(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player, _, _, _ = await _setup(client, db_session, "k3")
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_xxx")
    resp = await client.get("/api/v1/payments/methods", headers=auth_header(player))
    data = resp.json()["data"]
    assert [m["key"] for m in data] == ["stripe", "manual", "jazzcash", "easypaisa"]
    assert [m["state"] for m in data] == ["unavailable", "available", "coming_soon", "coming_soon"]
    assert data[0]["message"] == "Card payments are not available yet."
    assert all(m["key"] != "mock" for m in data)
    monkeypatch.setattr(get_settings(), "stripe_secret_key", "sk_test_" + "a1b2c3d4e5" * 3)
    resp = await client.get("/api/v1/payments/methods", headers=auth_header(player))
    assert resp.json()["data"][0]["state"] == "available"


async def test_bank_transfer_still_starts(client: AsyncClient, db_session: AsyncSession) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k4")
    slots = await _slots(client, court_id, day)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])
    resp = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "bank_transfer"},
    )
    assert resp.status_code == 200


async def test_preview_prices_three_slots_and_matches_the_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k5")
    slots = await _slots(client, court_id, day)
    ids = [s["id"] for s in slots[:3]]
    body = {"court_id": court_id, "slot_ids": ids}
    prev = await client.post("/api/v1/bookings/preview", headers=auth_header(player), json=body)
    assert prev.status_code == 200
    p = prev.json()["data"]
    assert float(p["slots_subtotal"]) == 6000.0 and float(p["total"]) == 6000.0
    assert p["payment_type"] == "advance" and float(p["pay_now"]) == 3000.0
    assert float(p["due_at_arena"]) == 3000.0 and p["discount_status"] == "none"
    assert p["cancellation_note"].startswith("Free cancellation until ")

    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": ids, "payment_type": p["payment_type"]},
    )
    rows = made.json()["data"]["bookings"]
    assert len(rows) == 3
    assert sum(float(b["advance_amount"]) for b in rows) == float(p["pay_now"])
    assert float(made.json()["data"]["total"]) == float(p["total"])


async def test_preview_discount_applied_refused_and_lowercase(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, arena_id, court_id, day = await _setup(client, db_session, "k6")
    created = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=auth_header(owner),
        json={
            "code": "SAVE10",
            "discount_type": "percentage",
            "discount_value": "10",
            "min_booking_amount": "3000",
        },
    )
    assert created.status_code == 201
    slots = await _slots(client, court_id, day)
    ids = [s["id"] for s in slots[:2]]

    async def preview(code: str, slot_ids: list[str]) -> dict:
        r = await client.post(
            "/api/v1/bookings/preview",
            headers=auth_header(player),
            json={"court_id": court_id, "slot_ids": slot_ids, "discount_code": code},
        )
        assert r.status_code == 200
        return r.json()["data"]

    ok = await preview("save10", ids)
    assert ok["discount_status"] == "applied" and float(ok["discount_amount"]) == 400.0
    assert float(ok["total"]) == 3600.0
    bad = await preview("WELCOME99", ids)
    assert bad["discount_status"] == "refused"
    assert bad["discount_message"] == "That code is not valid or has expired."
    assert float(bad["total"]) == 4000.0
    small = await preview("SAVE10", ids[:1])
    assert small["discount_status"] == "refused" and "at least" in small["discount_message"]


async def test_preview_says_409_when_a_slot_was_taken(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k7")
    other, _ = await make_user(client, db_session, "cp-k7b@example.com", "player")
    slots = await _slots(client, court_id, day)
    await _create_booking_group(client, other, court_id, slots[0]["id"])
    r = await client.post(
        "/api/v1/bookings/preview",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"], slots[1]["id"]]},
    )
    assert r.status_code == 409


async def test_group_details_and_release(client: AsyncClient, db_session: AsyncSession) -> None:
    _, player, _, court_id, day = await _setup(client, db_session, "k8")
    slots = await _slots(client, court_id, day)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])
    await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "bank_transfer"},
    )
    got = await client.get(f"/api/v1/bookings/group/{group_id}", headers=auth_header(player))
    d = got.json()["data"]
    assert d["booking_code"] == "AHB-" + group_id.replace("-", "")[:6].upper()
    assert d["arena_name"] and d["court_name"] == "Court A"
    assert d["payment_method"] == "bank_transfer"
    assert d["slot_ids"] == [slots[0]["id"]]
    assert float(d["pay_now"]) == 2000.0 and float(d["due_at_arena"]) == 0.0

    rel = await client.post(
        f"/api/v1/bookings/group/{group_id}/release", headers=auth_header(player)
    )
    assert rel.status_code == 200 and rel.json()["data"]["status"] == "cancelled"
    again = await _slots(client, court_id, day)
    assert next(s for s in again if s["id"] == slots[0]["id"])["status"] == "available"
    stranger, _ = await make_user(client, db_session, "cp-k8x@example.com", "player")
    other = await client.get(f"/api/v1/bookings/group/{group_id}", headers=auth_header(stranger))
    assert other.status_code == 404
