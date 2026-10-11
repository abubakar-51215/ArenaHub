"""Cancelling a booking group: the refund is worked out once per group from the
arena's policy and never exceeds what was paid. Also the cancel preview."""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.payment.model import Refund
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_payment import _next_weekday, _slots

OWNERS: dict[str, dict] = {}  # tag -> the arena owner tokens, for tests that edit slot prices
POLICY_FULL = [{"hours_before": 1, "refund_percentage": 100}]
POLICY_TIERS = [
    {"hours_before": 168, "refund_percentage": 100},
    {"hours_before": 1, "refund_percentage": 50},
]


async def _paid_group(
    client: AsyncClient,
    db: AsyncSession,
    tag: str,
    *,
    slot_count: int = 3,
    policy: list[dict] = POLICY_FULL,
    payment_type: str = "full",
):
    """A confirmed booking group of ``slot_count`` consecutive 2000 PKR slots, paid by card."""
    owner, _ = await make_user(client, db, f"gco-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"gcp-{tag}@example.com", "player")
    OWNERS[tag] = owner
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(advance_percentage=50, require_full_payment=False, refund_policy=policy),
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db, f"gca-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = await _slots(client, court_id, monday)
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [s["id"] for s in slots[:slot_count]],
            "payment_type": payment_type,
        },
    )
    group = made.json()["data"]
    paid = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group["booking_group_id"], "payment_method": "card"},
    )
    payment = paid.json()["data"]["payment"]
    await client.post(
        f"/api/v1/payments/{payment['id']}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    return player, group, payment, court_id, monday


async def _refunded(db: AsyncSession, payment_id: str) -> Decimal:
    rows = (await db.execute(select(Refund).where(Refund.payment_id == payment_id))).scalars().all()
    return sum((r.amount for r in rows), Decimal("0"))


async def test_cancelling_one_slot_of_three_does_not_refund_the_whole_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "m1")
    first = group["bookings"][0]["id"]
    resp = await client.post(
        f"/api/v1/bookings/{first}/cancel", headers=auth_header(player), json={}
    )
    assert resp.status_code == 200
    paid = Decimal(payment["amount"])
    assert paid == Decimal("6000.00")
    # one slot of three is a third of the payment
    assert await _refunded(db_session, payment["id"]) == Decimal("2000.00")


async def test_group_cancel_refunds_once_and_never_more_than_paid(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "m2")
    gid = group["booking_group_id"]
    resp = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["status"] == "cancelled"
    assert Decimal(data["refund_amount"]) == Decimal("6000.00")
    assert await _refunded(db_session, payment["id"]) == Decimal("6000.00")
    again = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert again.status_code == 422
    assert await _refunded(db_session, payment["id"]) == Decimal("6000.00")
    slots = await _slots(client, court_id, monday)
    assert all(s["status"] == "available" for s in slots[:3])


async def test_group_cancel_after_one_slot_was_cancelled_refunds_only_the_rest(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "m3")
    await client.post(
        f"/api/v1/bookings/{group['bookings'][0]['id']}/cancel",
        headers=auth_header(player),
        json={},
    )
    resp = await client.post(
        f"/api/v1/bookings/group/{group['booking_group_id']}/cancel",
        headers=auth_header(player),
        json={},
    )
    assert resp.status_code == 200
    assert await _refunded(db_session, payment["id"]) == Decimal("6000.00")


async def test_tier_percentage_is_applied_to_the_group_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "m4", policy=POLICY_TIERS)
    gid = group["booking_group_id"]
    prev = await client.get(
        f"/api/v1/bookings/group/{gid}/cancel-preview", headers=auth_header(player)
    )
    assert prev.status_code == 200
    p = prev.json()["data"]
    assert p["refund_percentage"] == 50
    assert Decimal(p["paid"]) == Decimal("6000.00")
    assert Decimal(p["refund_amount"]) == Decimal("3000.00")
    assert p["can_cancel"] is True
    assert "Free cancellation until" in p["policy_text"]
    done = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert Decimal(done.json()["data"]["refund_amount"]) == Decimal("3000.00")
    assert await _refunded(db_session, payment["id"]) == Decimal("3000.00")


async def test_cancel_preview_for_an_unpaid_booking_refunds_nothing(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "gco-m5@example.com", "owner")
    player, _ = await make_user(client, db_session, "gcp-m5@example.com", "player")
    arena = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "gca-m5@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = await _slots(client, court_id, monday)
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    gid = made.json()["data"]["booking_group_id"]
    p = (
        await client.get(
            f"/api/v1/bookings/group/{gid}/cancel-preview", headers=auth_header(player)
        )
    ).json()["data"]
    assert Decimal(p["paid"]) == Decimal("0") and Decimal(p["refund_amount"]) == Decimal("0")
    assert p["refund_percentage"] == 0


async def _group_with_receipt(client: AsyncClient, db: AsyncSession, tag: str, with_receipt: bool):
    """A bank-transfer booking group, with a receipt uploaded (awaiting approval) or without."""
    owner, _ = await make_user(client, db, f"gco-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"gcp-{tag}@example.com", "player")
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(advance_percentage=100),
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db, f"gca-{tag}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = await _slots(client, court_id, monday)
    made = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [s["id"] for s in slots[:2]],
            "payment_type": "full",
        },
    )
    gid = made.json()["data"]["booking_group_id"]
    init = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": gid, "payment_method": "bank_transfer"},
    )
    payment = init.json()["data"]["payment"]
    if with_receipt:
        sent = await client.post(
            f"/api/v1/payments/{payment['id']}/receipt",
            headers=auth_header(player),
            json={"receipt_proof_url": "/uploads/receipts/r.jpg"},
        )
        assert sent.status_code == 200
    return owner, player, gid, payment, court_id, monday


async def test_cancel_with_a_receipt_waiting_keeps_the_money_as_a_pending_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, gid, payment, court_id, monday = await _group_with_receipt(
        client, db_session, "r1", True
    )
    prev = (
        await client.get(
            f"/api/v1/bookings/group/{gid}/cancel-preview", headers=auth_header(player)
        )
    ).json()["data"]
    assert Decimal(prev["paid"]) == Decimal("4000.00")
    assert Decimal(prev["refund_amount"]) == Decimal("4000.00")
    assert prev["receipt_waiting"] is True
    done = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert done.status_code == 200
    d = done.json()["data"]
    assert d["status"] == "cancelled"
    assert Decimal(d["refund_amount"]) == Decimal("4000.00") and d["refund_status"] == "pending"
    rows = (
        (await db_session.execute(select(Refund).where(Refund.payment_id == payment["id"])))
        .scalars()
        .all()
    )
    assert (
        len(rows) == 1
        and rows[0].amount == Decimal("4000.00")
        and rows[0].status.value == "pending"
    )
    # the owner can no longer approve that receipt
    approve = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/approve", headers=auth_header(owner)
    )
    assert approve.status_code in (403, 404, 409, 422)
    again = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert again.status_code == 422
    assert await _refunded(db_session, payment["id"]) == Decimal("4000.00")
    slots = await _slots(client, court_id, monday)
    assert all(s["status"] == "available" for s in slots[:2])


async def test_cancel_without_a_receipt_has_nothing_to_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, player, gid, payment, _, _ = await _group_with_receipt(client, db_session, "r2", False)
    prev = (
        await client.get(
            f"/api/v1/bookings/group/{gid}/cancel-preview", headers=auth_header(player)
        )
    ).json()["data"]
    assert Decimal(prev["paid"]) == Decimal("0") and Decimal(prev["refund_amount"]) == Decimal("0")
    assert prev["receipt_waiting"] is False
    done = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert done.status_code == 200 and Decimal(done.json()["data"]["refund_amount"]) == 0
    assert await _refunded(db_session, payment["id"]) == Decimal("0")


async def test_rejected_receipt_shows_the_owner_reason_on_the_group(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, gid, payment, _, _ = await _group_with_receipt(client, db_session, "r3", True)
    rej = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/reject",
        headers=auth_header(owner),
        json={"reason": "The amount does not match."},
    )
    assert rej.status_code == 200
    d = (await client.get(f"/api/v1/bookings/group/{gid}", headers=auth_header(player))).json()[
        "data"
    ]
    assert d["status"] == "rejected" and d["cancellation_reason"] == "The amount does not match."
    items = (
        await client.get(
            "/api/v1/bookings/groups", headers=auth_header(player), params={"tab": "cancelled"}
        )
    ).json()["data"]["items"]
    assert [i["status"] for i in items] == ["rejected"]
