"""Business-flow safety (OWASP API6): retried requests do not repeat, and the server alone sets
prices, owners, roles and states."""

import uuid
from typing import Any

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking
from app.modules.payment.model import Payment
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _make_bookable_court, _slots


async def _setup(client: AsyncClient, db: AsyncSession, tag: str) -> Any:
    owner, _ = await make_user(client, db, f"br-owner-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"br-player-{tag}@example.com", "player")
    _, court, day = await _make_bookable_court(client, db, owner, f"br-{tag}")
    return owner, player, court, await _slots(client, court, day)


def _body(court: str, slot: str) -> dict:
    return {"court_id": court, "slot_ids": [slot], "payment_type": "full"}


async def test_a_retried_booking_with_the_same_key_makes_one_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "idem1")
    body = _body(court, slots[0]["id"])
    headers = {**auth_header(player), "Idempotency-Key": uuid.uuid4().hex}
    first = await client.post("/api/v1/bookings", headers=headers, json=body)
    again = await client.post("/api/v1/bookings", headers=headers, json=body)
    assert first.status_code == again.status_code == 200
    assert first.json()["data"]["booking_group_id"] == again.json()["data"]["booking_group_id"]
    count = await db_session.scalar(select(func.count()).select_from(Booking))
    assert count == 1


async def test_the_same_key_with_a_different_request_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "idem2")
    headers = {**auth_header(player), "Idempotency-Key": uuid.uuid4().hex}
    one = _body(court, slots[0]["id"])
    two = _body(court, slots[1]["id"])
    assert (await client.post("/api/v1/bookings", headers=headers, json=one)).status_code == 200
    refused = await client.post("/api/v1/bookings", headers=headers, json=two)
    assert refused.status_code == 422


async def test_a_key_belongs_to_one_person(client: AsyncClient, db_session: AsyncSession) -> None:
    _, player, court, slots = await _setup(client, db_session, "idem3")
    other, _ = await make_user(client, db_session, "br-other-idem3@example.com", "player")
    key = uuid.uuid4().hex
    body = _body(court, slots[0]["id"])
    mine = await client.post(
        "/api/v1/bookings", headers={**auth_header(player), "Idempotency-Key": key}, json=body
    )
    theirs = await client.post(
        "/api/v1/bookings", headers={**auth_header(other), "Idempotency-Key": key}, json=body
    )
    assert mine.status_code == 200
    # the other person is not handed my answer: they get their own (the slot is taken)
    assert theirs.status_code == 409


async def test_a_failed_attempt_is_not_remembered(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "idem4")
    headers = {**auth_header(player), "Idempotency-Key": uuid.uuid4().hex}
    bad = _body(court, str(uuid.uuid4()))
    assert (await client.post("/api/v1/bookings", headers=headers, json=bad)).status_code == 404
    again = await client.post("/api/v1/bookings", headers=headers, json=bad)
    assert again.status_code == 404  # run again, not "already being processed"


async def _pay_by_bank(client: AsyncClient, player: dict, court: str, slot: str) -> str:
    booked = await client.post(
        "/api/v1/bookings", headers=auth_header(player), json=_body(court, slot)
    )
    pay = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={
            "booking_group_id": booked.json()["data"]["booking_group_id"],
            "payment_method": "bank_transfer",
        },
    )
    return pay.json()["data"]["payment"]["id"]


async def test_a_retried_receipt_does_not_double_submit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "idem5")
    pid = await _pay_by_bank(client, player, court, slots[0]["id"])
    headers = {**auth_header(player), "Idempotency-Key": "rcpt-" + uuid.uuid4().hex}
    body = {"receipt_proof_url": "/uploads/receipts/e12f6e150d081437bc6ba7761416df89.jpg"}
    a = await client.post(f"/api/v1/payments/{pid}/receipt", headers=headers, json=body)
    b = await client.post(f"/api/v1/payments/{pid}/receipt", headers=headers, json=body)
    assert a.status_code == b.status_code == 200
    assert await db_session.scalar(select(func.count()).select_from(Payment)) == 1


async def test_a_receipt_must_be_a_photo_we_stored(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "rcpt")
    pid = await _pay_by_bank(client, player, court, slots[0]["id"])
    for bad in (
        "https://evil.example/x.jpg",
        "javascript:alert(1)",
        "/uploads/receipts/../../etc/passwd",
        "/uploads/arenas/other.jpg",
        "/uploads/receipts/x.jpg?next=https://evil.example",
    ):
        res = await client.post(
            f"/api/v1/payments/{pid}/receipt",
            headers=auth_header(player),
            json={"receipt_proof_url": bad},
        )
        assert res.status_code == 422, bad


async def test_fields_the_server_decides_cannot_be_sent(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "extra")
    sneaky = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={**_body(court, slots[0]["id"]), "total_amount": "1", "player_id": str(uuid.uuid4())},
    )
    assert sneaky.status_code == 422
    me = await client.put(
        "/api/v1/users/me", headers=auth_header(player), json={"full_name": "Mx", "role": "admin"}
    )
    assert me.status_code == 422
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "br-mass@example.com",
            "password": "Correct-Horse-9",
            "full_name": "Mass Assign",
            "phone": "+923001234567",
            "role": "admin",
            "email_verified": True,
        },
    )
    assert reg.status_code == 422


async def test_the_price_comes_from_the_server(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, court, slots = await _setup(client, db_session, "price")
    preview = await client.post(
        "/api/v1/bookings/preview",
        headers=auth_header(player),
        json={"court_id": court, "slot_ids": [slots[0]["id"]]},
    )
    assert preview.status_code == 200
    assert float(preview.json()["data"]["total"]) == 2000.0


async def test_extra_limits_stop_a_person_hammering_a_costly_action(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.cache import redis as redis_cache

    player, _ = await make_user(client, db_session, "br-hammer@example.com", "player")
    codes = []
    for _ in range(12):
        # keep the per-address counter clear: only the per-person limit is under test
        await redis_cache.get_redis().delete("ratelimit:api:127.0.0.1")
        res = await client.post(
            "/api/v1/complaints",
            headers=auth_header(player),
            json={"category": "other", "description": "y"},
        )
        codes.append(res.status_code)
    assert codes[-1] == 429
    assert 429 not in codes[:10]
