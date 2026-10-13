"""Suspending an arena refunds once per booking group, not once per hour.

One refund row, one "Refund initiated" and one "Booking cancelled" for the player, one
"A refund is waiting for you" for the owner. The amount is what was paid for the cancelled hours
and never more: a part-paid group gets its advance back, an unpaid group gets no refund row, and
a group that already has a pending refund only gets what is left. A receipt still waiting for the
owner becomes one pending refund of the full amount (the money may have arrived).
"""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.booking.model import Booking
from app.modules.notification.model import Notification
from app.modules.payment.model import Refund, RefundStatus
from tests.helpers import auth_header, make_user
from tests.modules.test_admin_arena_actions import API, _act, _fresh, _setup, _slot_ids


async def _book(client, player, court_id, slot_ids, plan="full") -> dict:
    made = await client.post(
        f"{API}/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": slot_ids, "payment_type": plan},
    )
    assert made.status_code == 200, made.text
    gid = made.json()["data"]["booking_group_id"]
    group = (await client.get(f"{API}/bookings/group/{gid}", headers=auth_header(player))).json()
    return group["data"]


async def _send_receipt(client, player, gid) -> str:
    init = await client.post(
        f"{API}/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": gid, "payment_method": "bank_transfer"},
    )
    pid = init.json()["data"]["payment"]["id"]
    await client.post(
        f"{API}/payments/{pid}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": "/media/receipts/r.png"},
    )
    return pid


async def _paid(client, owner, player, gid) -> None:
    pid = await _send_receipt(client, player, gid)
    ok = await client.post(f"{API}/owner/payments/{pid}/approve", headers=auth_header(owner))
    assert ok.status_code == 200, ok.text


async def _group_refunds(db: AsyncSession, booking_ids: list[str]) -> list[Refund]:
    return list(await _fresh(db, select(Refund).where(Refund.booking_id.in_(booking_ids))))


async def _events(db: AsyncSession, user_id, booking_ids: list[str]) -> list[str]:
    rows = await _fresh(db, select(Notification).where(Notification.user_id == user_id))
    return [n.event for n in rows if (n.data or {}).get("booking_id") in booking_ids]


async def test_a_three_hour_paid_booking_gets_one_refund_and_one_notice_each(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "sr1")
    player, player_user = await make_user(client, db_session, "sr1-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    g = await _book(client, player, s["court_id"], slots[:3])
    await _paid(client, s["owner"], player, g["booking_group_id"])

    assert (await _act(client, s["admin"], s["arena_id"], "suspend")).status_code == 200

    refunds = await _group_refunds(db_session, g["booking_ids"])
    assert len(refunds) == 1
    assert refunds[0].amount == Decimal("6000.00") == Decimal(g["total"])
    player_events = await _events(db_session, player_user.id, g["booking_ids"])
    assert player_events.count("refund_initiated") == 1
    assert player_events.count("booking_cancelled") == 1
    owner_events = await _events(db_session, s["owner_id"], g["booking_ids"])
    assert owner_events.count("refund_to_send") == 1
    # one line in the owner's Refunds tab and in the admin Refunds list
    owner_list = (
        await client.get(f"{API}/owner/refunds?status=all", headers=auth_header(s["owner"]))
    ).json()["data"]["items"]
    assert [r["booking_code"] for r in owner_list].count(g["booking_code"]) == 1
    admin_list = (
        await client.get(f"{API}/admin/refunds?status=all", headers=auth_header(s["admin"]))
    ).json()["data"]["items"]
    assert [r["booking_code"] for r in admin_list].count(g["booking_code"]) == 1


async def test_a_part_paid_booking_gets_back_what_was_paid(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "sr2")
    player, _ = await make_user(client, db_session, "sr2-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    g = await _book(client, player, s["court_id"], slots[:2], plan="advance")
    await _paid(client, s["owner"], player, g["booking_group_id"])
    paid = Decimal(g["pay_now"])
    assert paid < Decimal(g["total"])

    await _act(client, s["admin"], s["arena_id"], "suspend")

    [refund] = await _group_refunds(db_session, g["booking_ids"])
    assert refund.amount == paid


async def test_an_unpaid_booking_is_cancelled_with_no_refund_row(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "sr3")
    player, _ = await make_user(client, db_session, "sr3-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    g = await _book(client, player, s["court_id"], slots[:2])

    await _act(client, s["admin"], s["arena_id"], "suspend")

    assert await _group_refunds(db_session, g["booking_ids"]) == []
    rows = await _fresh(db_session, select(Booking).where(Booking.id.in_(g["booking_ids"])))
    assert {r.status.value for r in rows} == {"cancelled"}


async def test_a_group_with_a_pending_refund_is_never_refunded_twice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "sr4")
    player, _ = await make_user(client, db_session, "sr4-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    g = await _book(client, player, s["court_id"], slots[:3])
    await _paid(client, s["owner"], player, g["booking_group_id"])
    # the player cancels one hour first: a pending refund for that hour's share
    one = await client.post(
        f"{API}/bookings/{g['booking_ids'][0]}/cancel", headers=auth_header(player), json={}
    )
    assert one.status_code == 200, one.text
    before = await _group_refunds(db_session, g["booking_ids"])
    assert len(before) == 1 and before[0].status == RefundStatus.pending

    await _act(client, s["admin"], s["arena_id"], "suspend")

    after = await _group_refunds(db_session, g["booking_ids"])
    assert len(after) == 2  # one more row for the two hours left, not two
    assert sum(r.amount for r in after) == Decimal(g["total"])  # never more than was paid


async def test_a_receipt_still_waiting_becomes_one_pending_refund_of_the_full_amount(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "sr5")
    player, _ = await make_user(client, db_session, "sr5-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    g = await _book(client, player, s["court_id"], slots[:2])
    await _send_receipt(client, player, g["booking_group_id"])

    await _act(client, s["admin"], s["arena_id"], "suspend")

    [refund] = await _group_refunds(db_session, g["booking_ids"])
    assert refund.status == RefundStatus.pending
    assert refund.amount == Decimal(g["total"])
