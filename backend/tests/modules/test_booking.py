"""Booking creation, pricing, concurrency, cancellation, and reschedule
tests — the mandatory Sprint 3 exit criteria (docs/15): two concurrent
booking attempts on one slot -> exactly one succeeds; payment_type/refund
tier behaviour."""

import asyncio
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7
    return today + timedelta(days=days_ahead)


async def _make_bookable_court(
    client: AsyncClient, db_session: AsyncSession, owner: dict, owner_email: str
) -> tuple[str, str, date]:
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=h,
        json=arena_payload(advance_percentage=50, require_full_payment=False),
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-{owner_email}@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]

    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    return arena_id, court_id, monday


async def _slots(client: AsyncClient, h: dict, court_id: str, target_date: date) -> list[dict]:
    resp = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": target_date.isoformat()}
    )
    return resp.json()["data"]


async def test_create_booking_full_payment_single_slot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer1@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner1")
    slots = await _slots(client, auth_header(owner), court_id, monday)

    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
        },
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert len(body["bookings"]) == 1
    booking = body["bookings"][0]
    assert booking["status"] == "pending_payment"
    assert booking["total_amount"] == "2000.00"
    assert booking["advance_amount"] == "2000.00"
    assert booking["remaining_amount"] == "0.00"

    # The slot is now reserved, not offered to other players.
    refreshed = await _slots(client, auth_header(owner), court_id, monday)
    assert refreshed[0]["status"] == "reserved"


async def test_create_booking_advance_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner2@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer2@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner2")
    slots = await _slots(client, auth_header(owner), court_id, monday)

    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "advance"},
    )
    assert resp.status_code == 200
    booking = resp.json()["data"]["bookings"][0]
    assert booking["advance_amount"] == "1000.00"  # 50% of 2000
    assert booking["remaining_amount"] == "1000.00"


async def test_create_booking_multi_slot_shares_group_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner3@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer3@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner3")
    slots = await _slots(client, auth_header(owner), court_id, monday)

    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"], slots[1]["id"]],
            "payment_type": "full",
        },
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert len(body["bookings"]) == 2
    assert body["bookings"][0]["booking_group_id"] == body["bookings"][1]["booking_group_id"]
    assert body["bookings"][0]["booking_group_id"] == body["booking_group_id"]
    total = sum(float(b["total_amount"]) for b in body["bookings"])
    assert total == 4000.0


async def test_create_booking_with_discount_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer4@example.com", "player")
    h = auth_header(owner)
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner4")
    await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=h,
        json={
            "code": "SAVE10",
            "discount_type": "percentage",
            "discount_value": "10.00",
            "min_booking_amount": "0",
        },
    )
    slots = await _slots(client, h, court_id, monday)

    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
            "discount_code": "SAVE10",
        },
    )
    assert resp.status_code == 200
    booking = resp.json()["data"]["bookings"][0]
    assert booking["total_amount"] == "1800.00"  # 2000 - 10%


async def test_advance_rejected_when_arena_requires_full_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner5@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer5@example.com", "player")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=h,
        json=arena_payload(require_full_payment=True),
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin-bookowner5@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_weekday(1)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=h,
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    slots = await _slots(client, h, court_id, monday)

    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "advance"},
    )
    assert resp.status_code == 422


async def test_concurrent_booking_attempts_exactly_one_succeeds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Mandatory Sprint 3 concurrency test: two simultaneous booking attempts
    on the same slot, exactly one wins."""
    owner, _ = await make_user(client, db_session, "bookowner6@example.com", "owner")
    p1, _ = await make_user(client, db_session, "bookplayer6a@example.com", "player")
    p2, _ = await make_user(client, db_session, "bookplayer6b@example.com", "player")
    h = auth_header(owner)
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner6")
    slots = await _slots(client, h, court_id, monday)
    slot_id = slots[0]["id"]

    payload = {"court_id": court_id, "slot_ids": [slot_id], "payment_type": "full"}
    results = await asyncio.gather(
        client.post("/api/v1/bookings", headers=auth_header(p1), json=payload),
        client.post("/api/v1/bookings", headers=auth_header(p2), json=payload),
    )
    statuses = sorted(r.status_code for r in results)
    assert statuses == [200, 409]


async def test_cancel_pending_payment_booking_no_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner7@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer7@example.com", "player")
    h = auth_header(owner)
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner7")
    slots = await _slots(client, h, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    cancelled = await client.post(
        f"/api/v1/bookings/{booking_id}/cancel",
        headers=auth_header(player),
        json={"reason": "changed my mind"},
    )
    assert cancelled.status_code == 200
    data = cancelled.json()["data"]
    assert data["status"] == "cancelled"
    assert data["refund_eligible"] is False

    freed = await _slots(client, h, court_id, monday)
    assert freed[0]["status"] == "available"


async def test_cancel_confirmed_booking_applies_refund_tier(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner8@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer8@example.com", "player")
    h = auth_header(owner)
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner8")
    slots = await _slots(client, h, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    # Simulate the payment module confirming the booking (not built yet).
    import uuid as uuid_mod

    from app.modules.booking import repository as booking_repo
    from app.modules.booking.model import BookingStatus

    booking = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert booking is not None
    booking.status = BookingStatus.confirmed
    await db_session.commit()

    # arena_payload's refund_policy: [{"hours_before": 24, "refund_percentage": 100}]
    # monday is > 24h away, so a cancellation now should be 100% refund-eligible.
    cancelled = await client.post(
        f"/api/v1/bookings/{booking_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200
    data = cancelled.json()["data"]
    assert data["refund_eligible"] is True
    assert data["refund_percentage"] == 100


async def test_reschedule_booking_to_another_slot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner9@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer9@example.com", "player")
    h = auth_header(owner)
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner9")
    slots = await _slots(client, h, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    import uuid as uuid_mod

    from app.modules.booking import repository as booking_repo
    from app.modules.booking.model import BookingStatus
    from app.modules.slot import repository as slot_repo
    from app.modules.slot.model import SlotStatus

    booking = await booking_repo.get_booking(db_session, uuid_mod.UUID(booking_id))
    assert booking is not None
    booking.status = BookingStatus.confirmed
    # Simulate the payment module marking the slot booked on confirmation.
    old_slot = await slot_repo.get_slot(db_session, booking.slot_id)
    assert old_slot is not None
    old_slot.status = SlotStatus.booked
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/bookings/{booking_id}/reschedule",
        headers=auth_header(player),
        json={"new_slot_id": slots[1]["id"]},
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["slot_id"] == slots[1]["id"]
    assert data["start_time"] == slots[1]["start_time"]

    refreshed = await _slots(client, h, court_id, monday)
    by_id = {s["id"]: s for s in refreshed}
    assert by_id[slots[0]["id"]]["status"] == "available"
    assert by_id[slots[1]["id"]]["status"] == "booked"


async def test_auto_cancel_stale_pending_payment_bookings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bookowner10@example.com", "owner")
    player, _ = await make_user(client, db_session, "bookplayer10@example.com", "player")
    h = auth_header(owner)
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "bookowner10")
    slots = await _slots(client, h, court_id, monday)

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    booking_id = created.json()["data"]["bookings"][0]["id"]

    from datetime import datetime
    from datetime import timedelta as td

    from app.modules.booking import service as booking_service

    cancelled_count = await booking_service.auto_cancel_stale_bookings(
        db_session, now=datetime.now() + td(hours=25)
    )
    assert cancelled_count == 1

    check = await client.get(f"/api/v1/bookings/{booking_id}", headers=auth_header(player))
    assert check.json()["data"]["status"] == "cancelled"
    freed = await _slots(client, h, court_id, monday)
    assert freed[0]["status"] == "available"
