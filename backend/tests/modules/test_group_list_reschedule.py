"""My bookings as one card per group (tabs decided by the server) and moving a
whole booking to new times with a price-difference preview."""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header
from tests.modules.test_group_cancel import OWNERS, _paid_group, _refunded
from tests.modules.test_payment import _slots


async def _tab(client: AsyncClient, player: dict, tab: str) -> list[dict]:
    r = await client.get(
        "/api/v1/bookings/groups", headers=auth_header(player), params={"tab": tab}
    )
    assert r.status_code == 200
    return r.json()["data"]["items"]


async def test_grouped_list_has_one_card_per_booking_and_the_server_picks_the_tab(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, _, _ = await _paid_group(client, db_session, "l1")
    up = await _tab(client, player, "upcoming")
    assert len(up) == 1 and up[0]["slot_count"] == 3
    assert up[0]["status"] == "confirmed" and Decimal(up[0]["total"]) == Decimal("6000.00")
    assert up[0]["booking_code"].startswith("AHB-") and up[0]["refund_status"] is None
    assert (
        up[0]["booking_id"] in [b["id"] for b in group["bookings"]] and up[0]["my_rating"] is None
    )
    assert (
        await _tab(client, player, "past") == [] and await _tab(client, player, "cancelled") == []
    )

    gid = group["booking_group_id"]
    await client.post(f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={})
    assert await _tab(client, player, "upcoming") == []
    gone = await _tab(client, player, "cancelled")
    assert len(gone) == 1 and Decimal(gone[0]["refund_amount"]) == Decimal("6000.00")
    assert gone[0]["refund_status"] in ("pending", "processed")
    assert await _refunded(db_session, payment["id"]) == Decimal("6000.00")


async def test_group_reschedule_moves_all_slots_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, _, court_id, monday = await _paid_group(client, db_session, "l2")
    gid = group["booking_group_id"]
    slots = await _slots(client, court_id, monday)
    new_ids = [s["id"] for s in slots[5:8]]
    url = f"/api/v1/bookings/group/{gid}"
    det = (await client.get(url, headers=auth_header(player))).json()["data"]
    assert det["can_cancel"] is True and det["can_reschedule"] is True

    prev = await client.post(
        url + "/reschedule-preview", headers=auth_header(player), json={"new_slot_ids": new_ids}
    )
    p = prev.json()["data"]
    assert Decimal(p["paid"]) == Decimal("6000.00") and Decimal(p["balance"]) == Decimal("0")
    assert Decimal(p["refund"]) == Decimal("0")

    done = await client.post(
        url + "/reschedule", headers=auth_header(player), json={"new_slot_ids": new_ids}
    )
    assert done.status_code == 200
    d = done.json()["data"]
    assert d["start_time"] == slots[5]["start_time"] and d["slot_count"] == 3
    assert d["can_reschedule"] is False
    after = await _slots(client, court_id, monday)
    assert all(s["status"] == "available" for s in after[:3])
    assert all(s["status"] == "booked" for s in after[5:8])

    again = await client.post(
        url + "/reschedule",
        headers=auth_header(player),
        json={"new_slot_ids": [s["id"] for s in slots[9:12]]},
    )
    assert again.status_code == 422 and "only once" in again.json()["message"]


async def test_reschedule_price_difference_balance_and_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, payment, court_id, monday = await _paid_group(client, db_session, "l3")
    gid = group["booking_group_id"]
    owner = OWNERS["l3"]
    slots = await _slots(client, court_id, monday)
    dear = slots[6]
    await client.patch(
        f"/api/v1/owner/courts/{court_id}/slots/{dear['id']}",
        headers=auth_header(owner),
        json={"price": "3000.00"},
    )
    cheap = slots[10]
    await client.patch(
        f"/api/v1/owner/courts/{court_id}/slots/{cheap['id']}",
        headers=auth_header(owner),
        json={"price": "1000.00"},
    )
    base = f"/api/v1/bookings/group/{gid}/reschedule-preview"
    up = await client.post(
        base, headers=auth_header(player), json={"new_slot_ids": [s["id"] for s in slots[5:8]]}
    )
    assert Decimal(up.json()["data"]["balance"]) == Decimal("1000.00")
    down = await client.post(
        base, headers=auth_header(player), json={"new_slot_ids": [s["id"] for s in slots[9:12]]}
    )
    d = down.json()["data"]
    assert Decimal(d["refund"]) == Decimal("1000.00") and Decimal(d["balance"]) == Decimal("0")
    await client.post(
        f"/api/v1/bookings/group/{gid}/reschedule",
        headers=auth_header(player),
        json={"new_slot_ids": [s["id"] for s in slots[9:12]]},
    )
    assert await _refunded(db_session, payment["id"]) == Decimal("1000.00")


async def test_reschedule_rejects_wrong_count_taken_and_non_consecutive(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, group, _, court_id, monday = await _paid_group(client, db_session, "l4")
    gid = group["booking_group_id"]
    slots = await _slots(client, court_id, monday)
    url = f"/api/v1/bookings/group/{gid}/reschedule-preview"
    two = await client.post(
        url, headers=auth_header(player), json={"new_slot_ids": [slots[5]["id"], slots[6]["id"]]}
    )
    assert two.status_code == 422
    gap = await client.post(
        url,
        headers=auth_header(player),
        json={"new_slot_ids": [slots[5]["id"], slots[6]["id"], slots[8]["id"]]},
    )
    assert gap.status_code == 422
    # a shift that overlaps the booking's own times is allowed
    shift = await client.post(
        url, headers=auth_header(player), json={"new_slot_ids": [s["id"] for s in slots[1:4]]}
    )
    assert shift.status_code == 200
