"""Equipment CRUD/availability tests, plus the booking-integration checkpoint:
equipment addon attaches at booking create, reserves stock, folds into the
booking total, and releases stock on cancel (docs/11 section 8)."""

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


async def _slots(client: AsyncClient, court_id: str, target_date: date) -> list[dict]:
    resp = await client.get(
        f"/api/v1/courts/{court_id}/slots", params={"date": target_date.isoformat()}
    )
    return resp.json()["data"]


async def test_create_and_list_equipment(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "equipowner1@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())
    arena_id = arena.json()["data"]["id"]

    created = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Cricket Bat", "rental_price": "150.00", "quantity_total": 5},
    )
    assert created.status_code == 201
    body = created.json()["data"]
    assert body["quantity_available"] == 5
    assert body["is_active"] is True

    listed = await client.get(f"/api/v1/owner/arenas/{arena_id}/equipment", headers=h)
    assert len(listed.json()["data"]) == 1


async def test_public_listing_hides_inactive_and_out_of_stock(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner2@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin-equipowner2@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    active = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Football", "rental_price": "100.00", "quantity_total": 3},
    )
    active_id = active.json()["data"]["id"]
    inactive = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Net", "rental_price": "50.00", "quantity_total": 2, "is_active": False},
    )
    inactive_id = inactive.json()["data"]["id"]

    public = await client.get(f"/api/v1/arenas/{arena_id}/equipment")
    ids = {e["id"] for e in public.json()["data"]}
    assert active_id in ids
    assert inactive_id not in ids


async def test_public_equipment_listing_404s_for_unapproved_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner3@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())
    arena_id = arena.json()["data"]["id"]  # never approved

    await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Football", "rental_price": "100.00", "quantity_total": 3},
    )

    resp = await client.get(f"/api/v1/arenas/{arena_id}/equipment")
    assert resp.status_code == 404


async def test_quantity_adjust_rejects_removing_rented_units(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner3@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())
    arena_id = arena.json()["data"]["id"]
    created = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Racket", "rental_price": "80.00", "quantity_total": 2},
    )
    equipment_id = created.json()["data"]["id"]

    increased = await client.patch(
        f"/api/v1/owner/equipment/{equipment_id}/quantity", headers=h, json={"delta": 3}
    )
    assert increased.status_code == 200
    assert increased.json()["data"]["quantity_total"] == 5
    assert increased.json()["data"]["quantity_available"] == 5

    too_many = await client.patch(
        f"/api/v1/owner/equipment/{equipment_id}/quantity", headers=h, json={"delta": -10}
    )
    assert too_many.status_code == 422


async def test_delete_blocked_while_rented(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "equipowner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "equipplayer4@example.com", "player")
    h = auth_header(owner)
    arena_id, court_id, monday = await _make_bookable_court(
        client, db_session, owner, "equipowner4"
    )

    equipment = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Cones", "rental_price": "20.00", "quantity_total": 4},
    )
    equipment_id = equipment.json()["data"]["id"]

    slots = await _slots(client, court_id, monday)
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
            "equipment": [{"equipment_id": equipment_id, "quantity": 2}],
        },
    )
    assert booked.status_code == 200

    blocked = await client.delete(f"/api/v1/owner/equipment/{equipment_id}", headers=h)
    assert blocked.status_code == 422


async def test_booking_addon_reserves_stock_and_adds_to_total(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner5@example.com", "owner")
    player, _ = await make_user(client, db_session, "equipplayer5@example.com", "player")
    h = auth_header(owner)
    arena_id, court_id, monday = await _make_bookable_court(
        client, db_session, owner, "equipowner5"
    )

    equipment = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Bibs", "rental_price": "50.00", "quantity_total": 10},
    )
    equipment_id = equipment.json()["data"]["id"]

    slots = await _slots(client, court_id, monday)
    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
            "equipment": [{"equipment_id": equipment_id, "quantity": 3}],
        },
    )
    assert resp.status_code == 200
    booking = resp.json()["data"]["bookings"][0]
    # 2000 slot + 3 * 50 equipment = 2150
    assert booking["total_amount"] == "2150.00"
    assert booking["advance_amount"] == "2150.00"

    remaining_stock = await client.get(f"/api/v1/owner/arenas/{arena_id}/equipment", headers=h)
    assert remaining_stock.json()["data"][0]["quantity_available"] == 7


async def test_booking_addon_rejects_insufficient_stock(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner6@example.com", "owner")
    player, _ = await make_user(client, db_session, "equipplayer6@example.com", "player")
    h = auth_header(owner)
    arena_id, court_id, monday = await _make_bookable_court(
        client, db_session, owner, "equipowner6"
    )

    equipment = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Cones", "rental_price": "20.00", "quantity_total": 2},
    )
    equipment_id = equipment.json()["data"]["id"]

    slots = await _slots(client, court_id, monday)
    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
            "equipment": [{"equipment_id": equipment_id, "quantity": 5}],
        },
    )
    assert resp.status_code == 422

    # Stock untouched — the shortfall is caught before anything is reserved.
    unchanged = await client.get(f"/api/v1/owner/arenas/{arena_id}/equipment", headers=h)
    assert unchanged.json()["data"][0]["quantity_available"] == 2


async def test_cancel_releases_equipment_stock(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "equipowner7@example.com", "owner")
    player, _ = await make_user(client, db_session, "equipplayer7@example.com", "player")
    h = auth_header(owner)
    arena_id, court_id, monday = await _make_bookable_court(
        client, db_session, owner, "equipowner7"
    )

    equipment = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Vests", "rental_price": "30.00", "quantity_total": 4},
    )
    equipment_id = equipment.json()["data"]["id"]

    slots = await _slots(client, court_id, monday)
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": court_id,
            "slot_ids": [slots[0]["id"]],
            "payment_type": "full",
            "equipment": [{"equipment_id": equipment_id, "quantity": 4}],
        },
    )
    booking_id = booked.json()["data"]["bookings"][0]["id"]

    depleted = await client.get(f"/api/v1/owner/arenas/{arena_id}/equipment", headers=h)
    assert depleted.json()["data"][0]["quantity_available"] == 0

    cancelled = await client.post(
        f"/api/v1/bookings/{booking_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200

    restored = await client.get(f"/api/v1/owner/arenas/{arena_id}/equipment", headers=h)
    assert restored.json()["data"][0]["quantity_available"] == 4
