"""Payment flow tests: card auto-confirm (via the dev simulate-confirm
endpoint, since no real Stripe/JazzCash/EasyPaisa sandbox is available),
bank_transfer receipt upload + owner approval/rejection, gateway webhooks,
refunds on cancel, and admin force-refund."""

import json
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


async def _create_booking_group(
    client: AsyncClient, player: dict, court_id: str, slot_id: str, payment_type: str = "full"
) -> str:
    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slot_id], "payment_type": payment_type},
    )
    return resp.json()["data"]["booking_group_id"]


async def test_card_payment_confirms_booking_via_simulate_confirm(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer1@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner1")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    assert initiated.status_code == 200
    body = initiated.json()["data"]
    payment_id = body["payment"]["id"]
    assert body["payment"]["status"] == "pending"
    assert body["client_secret"] is not None

    confirmed = await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["status"] == "completed"

    updated_slots = await _slots(client, court_id, monday)
    assert updated_slots[0]["status"] == "booked"

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    booked = my_bookings.json()["data"]["items"][0]
    assert booked["status"] == "confirmed"
    assert booked["qr_code_url"] is not None
    assert booked["qr_code_url"].startswith("/uploads/misc/")


async def test_card_payment_failure_cancels_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner2@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer2@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner2")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]

    failed = await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": False},
    )
    assert failed.status_code == 200
    assert failed.json()["data"]["status"] == "failed"

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    assert my_bookings.json()["data"]["items"][0]["status"] == "cancelled"

    freed_slots = await _slots(client, court_id, monday)
    assert freed_slots[0]["status"] == "available"


async def test_duplicate_payment_initiation_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner3@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer3@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner3")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    first = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    assert second.status_code == 409


async def test_bank_transfer_receipt_and_owner_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer4@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner4")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "bank_transfer"},
    )
    assert initiated.status_code == 200
    payment_id = initiated.json()["data"]["payment"]["id"]
    assert initiated.json()["data"]["client_secret"] is None
    assert initiated.json()["data"]["redirect_url"] is None

    receipt = await client.post(
        f"/api/v1/payments/{payment_id}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": "/uploads/receipts/fake.jpg"},
    )
    assert receipt.status_code == 200

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    assert my_bookings.json()["data"]["items"][0]["status"] == "pending_approval"

    approved = await client.post(
        f"/api/v1/owner/payments/{payment_id}/approve", headers=auth_header(owner)
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "completed"

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    booked = my_bookings.json()["data"]["items"][0]
    assert booked["status"] == "confirmed"
    assert booked["qr_code_url"] is not None


async def test_bank_transfer_owner_rejection_releases_slot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner5@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer5@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner5")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "bank_transfer"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": "/uploads/receipts/fake.jpg"},
    )

    rejected = await client.post(
        f"/api/v1/owner/payments/{payment_id}/reject",
        headers=auth_header(owner),
        json={"reason": "Receipt does not match the amount."},
    )
    assert rejected.status_code == 200
    assert rejected.json()["data"]["status"] == "failed"

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    assert my_bookings.json()["data"]["items"][0]["status"] == "rejected"

    freed_slots = await _slots(client, court_id, monday)
    assert freed_slots[0]["status"] == "available"


async def test_owner_cannot_approve_another_arenas_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner6@example.com", "owner")
    other_owner, _ = await make_user(client, db_session, "payowner6b@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer6@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner6")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "bank_transfer"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": "/uploads/receipts/fake.jpg"},
    )

    forbidden = await client.post(
        f"/api/v1/owner/payments/{payment_id}/approve", headers=auth_header(other_owner)
    )
    assert forbidden.status_code == 403


async def test_jazzcash_webhook_confirms_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner7@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer7@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner7")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "jazzcash"},
    )
    txn_id = initiated.json()["data"]["payment"]["gateway_transaction_id"]

    webhook = await client.post(
        "/api/v1/webhooks/jazzcash",
        content=json.dumps({"gateway_transaction_id": txn_id, "status": "completed"}),
    )
    assert webhook.status_code == 200

    my_bookings = await client.get("/api/v1/bookings", headers=auth_header(player))
    assert my_bookings.json()["data"]["items"][0]["status"] == "confirmed"

    # Webhooks are retried by gateways — a second delivery must be a no-op,
    # not a crash or a double-confirm.
    replay = await client.post(
        "/api/v1/webhooks/jazzcash",
        content=json.dumps({"gateway_transaction_id": txn_id, "status": "completed"}),
    )
    assert replay.status_code == 200


async def test_refund_created_and_processed_on_cancel_of_confirmed_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner8@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer8@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner8")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    booking_id = (await client.get("/api/v1/bookings", headers=auth_header(player))).json()["data"][
        "items"
    ][0]["id"]

    # arena_payload's refund_policy grants 100% > 24h before start; the
    # generated slot is next Monday, comfortably outside 24h.
    cancelled = await client.post(
        f"/api/v1/bookings/{booking_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["refund_eligible"] is True

    freed_slots = await _slots(client, court_id, monday)
    assert freed_slots[0]["status"] == "available"


async def test_admin_force_refund(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "payowner9@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer9@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner9")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    booking_id = (await client.get("/api/v1/bookings", headers=auth_header(player))).json()["data"][
        "items"
    ][0]["id"]

    admin = await make_admin(client, db_session, "force-refund-admin@example.com")
    forced = await client.post(
        f"/api/v1/admin/bookings/{booking_id}/force-refund", headers=auth_header(admin)
    )
    assert forced.status_code == 200
    assert forced.json()["data"]["status"] == "processed"
    assert forced.json()["data"]["amount"] == "2000.00"


async def test_receipt_pdf_downloads_for_completed_payment(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner10@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer10@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner10")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )

    pdf = await client.get(
        f"/api/v1/payments/{payment_id}/receipt.pdf", headers=auth_header(player)
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")

    other_player, _ = await make_user(client, db_session, "payplayer10b@example.com", "player")
    forbidden = await client.get(
        f"/api/v1/payments/{payment_id}/receipt.pdf", headers=auth_header(other_player)
    )
    assert forbidden.status_code == 403


async def test_get_payment_by_group_resolves_id_for_receipt_lookup(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "payowner11@example.com", "owner")
    player, _ = await make_user(client, db_session, "payplayer11@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "payowner11")
    slots = await _slots(client, court_id, monday)
    group_id = await _create_booking_group(client, player, court_id, slots[0]["id"])

    initiated = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = initiated.json()["data"]["payment"]["id"]

    resolved = await client.get(
        f"/api/v1/payments/by-group/{group_id}", headers=auth_header(player)
    )
    assert resolved.status_code == 200
    assert resolved.json()["data"]["id"] == payment_id
    assert resolved.json()["data"]["booking_group_id"] == group_id

    other_player, _ = await make_user(client, db_session, "payplayer11b@example.com", "player")
    forbidden = await client.get(
        f"/api/v1/payments/by-group/{group_id}", headers=auth_header(other_player)
    )
    assert forbidden.status_code == 403
