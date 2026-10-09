"""Owner dashboard tests: summary widgets, cross-arena pending-approval
queue, calendar view, and revenue widgets."""

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


async def test_dashboard_summary_counts_arenas_and_pending_approvals(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner1@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer1@example.com", "player")
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner1")
    slots = await _slots(client, court_id, monday)

    group = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = group.json()["data"]["booking_group_id"]
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

    summary = await client.get("/api/v1/owner/dashboard/summary", headers=auth_header(owner))
    assert summary.status_code == 200
    body = summary.json()["data"]
    assert body["total_arenas"] == 1
    assert body["pending_approvals"] == 1


async def test_pending_approvals_panel_lists_across_all_owner_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner2@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer2@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner2")
    slots = await _slots(client, court_id, monday)

    group = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = group.json()["data"]["booking_group_id"]
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

    panel = await client.get(
        "/api/v1/owner/dashboard/pending-approvals", headers=auth_header(owner)
    )
    assert panel.status_code == 200
    items = panel.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["arena_id"] == arena_id
    assert items[0]["payment_method"] == "bank_transfer"
    assert items[0]["receipt_proof_url"] == "/uploads/receipts/fake.jpg"

    # Approving clears it from the queue.
    await client.post(f"/api/v1/owner/payments/{payment_id}/approve", headers=auth_header(owner))
    after = await client.get(
        "/api/v1/owner/dashboard/pending-approvals", headers=auth_header(owner)
    )
    assert after.json()["data"]["items"] == []


async def test_calendar_view_scoped_to_owned_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner3@example.com", "owner")
    other_owner, _ = await make_user(client, db_session, "dashowner3b@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer3@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner3")
    slots = await _slots(client, court_id, monday)

    await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )

    week_start = monday - timedelta(days=1)
    week_end = monday + timedelta(days=1)
    calendar_resp = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/bookings/calendar",
        headers=auth_header(owner),
        params={"from": week_start.isoformat(), "to": week_end.isoformat()},
    )
    assert calendar_resp.status_code == 200
    entries = calendar_resp.json()["data"]
    assert len(entries) == 1
    assert entries[0]["booking_date"] == monday.isoformat()

    forbidden = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/bookings/calendar",
        headers=auth_header(other_owner),
        params={"from": week_start.isoformat(), "to": week_end.isoformat()},
    )
    assert forbidden.status_code == 403


async def test_analytics_reflects_confirmed_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner5@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer5@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner5")
    slots = await _slots(client, court_id, monday)

    group = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = group.json()["data"]["booking_group_id"]
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

    # Range spanning today (payment date) and the booked slot's date.
    date_from = min(date.today(), monday).isoformat()
    date_to = max(date.today(), monday).isoformat()
    resp = await client.get(
        "/api/v1/owner/dashboard/analytics",
        headers=auth_header(owner),
        params={"date_from": date_from, "date_to": date_to},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["total_revenue"] == "2000.00"
    assert body["total_bookings"] == 1
    assert body["occupancy_rate"] is not None and body["occupancy_rate"] > 0
    assert body["peak_hours"] is not None
    assert sum(p["count"] for p in body["bookings_by_time"]) == 1
    assert sum(float(p["amount"]) for p in body["revenue_trend"]) == 2000.0
    assert body["top_arenas"][0]["name"] == "Downtown Futsal Arena"
    assert body["recent_bookings"][0]["court_name"] == "Court A"

    # City filter: no arenas in Karachi -> everything zero.
    empty = await client.get(
        "/api/v1/owner/dashboard/analytics",
        headers=auth_header(owner),
        params={"date_from": date_from, "date_to": date_to, "city": "Karachi"},
    )
    assert empty.json()["data"]["total_bookings"] == 0


async def test_owner_bookings_table_lists_and_filters(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner6@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer6@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner6")
    slots = await _slots(client, court_id, monday)

    await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )

    table = await client.get("/api/v1/owner/dashboard/bookings", headers=auth_header(owner))
    assert table.status_code == 200
    items = table.json()["data"]["items"]
    assert len(items) == 1
    row = items[0]
    assert row["arena_name"] == "Downtown Futsal Arena"
    assert row["court_name"] == "Court A"
    assert row["player_name"] == "Test User"
    assert row["status"] == "pending_payment"
    assert row["total_amount"] == "2000.00"
    # the player's phone arrives masked (the test user's number is 0300...), and
    # no payment exists yet for a booking that has not been paid
    assert row["player_phone"].startswith("+92 300") and row["player_phone"].endswith("••••")
    assert row["payment_method"] is None and row["payment_status"] is None

    # Status filter excludes it; matching filter keeps it.
    none = await client.get(
        "/api/v1/owner/dashboard/bookings",
        headers=auth_header(owner),
        params={"status": "confirmed"},
    )
    assert none.json()["data"]["items"] == []
    same = await client.get(
        "/api/v1/owner/dashboard/bookings",
        headers=auth_header(owner),
        params={"status": "pending_payment", "arena_id": arena_id, "court_id": court_id},
    )
    assert len(same.json()["data"]["items"]) == 1


async def test_revenue_widgets_sum_completed_payments(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "dashowner4@example.com", "owner")
    player, _ = await make_user(client, db_session, "dashplayer4@example.com", "player")
    arena_id, court_id, monday = await _make_bookable_court(client, db_session, owner, "dashowner4")
    slots = await _slots(client, court_id, monday)

    group = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = group.json()["data"]["booking_group_id"]
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

    revenue = await client.get("/api/v1/owner/dashboard/revenue", headers=auth_header(owner))
    assert revenue.status_code == 200
    body = revenue.json()["data"]
    assert body["total_revenue"] == "2000.00"
    assert body["breakdown_by_arena"] == [{"id": arena_id, "amount": "2000.00"}]

    scoped = await client.get(
        "/api/v1/owner/dashboard/revenue",
        headers=auth_header(owner),
        params={"arena_id": arena_id},
    )
    assert scoped.json()["data"]["total_revenue"] == "2000.00"


def test_phone_mask_hides_all_but_the_prototype_prefix() -> None:
    from app.modules.dashboard.service import mask_phone

    assert mask_phone("03001112233") == "+92 300 11••••"
    assert mask_phone("+923215550101") == "+92 321 55••••"
    assert mask_phone("12345678") == "1234••••"
    assert mask_phone("del-9f3a1c") is None  # a deleted user's anonymised value
    assert mask_phone(None) is None and mask_phone("") is None


async def _awaiting_booking(client: AsyncClient, db_session: AsyncSession, tag: str):
    """An owner, a player and one booking awaiting payment (a future Monday)."""
    owner, _ = await make_user(client, db_session, f"remind-owner-{tag}@example.com", "owner")
    player, player_row = await make_user(
        client, db_session, f"remind-pl-{tag}@example.com", "player"
    )
    _, court_id, monday = await _make_bookable_court(client, db_session, owner, f"remind-{tag}")
    slots = await _slots(client, court_id, monday)
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    assert booked.status_code == 200
    table = await client.get("/api/v1/owner/dashboard/bookings", headers=auth_header(owner))
    return owner, player, player_row, table.json()["data"]["items"][0]["booking_id"]


async def _row(client: AsyncClient, owner: dict, booking_id: str) -> dict:
    table = await client.get("/api/v1/owner/dashboard/bookings", headers=auth_header(owner))
    return next(r for r in table.json()["data"]["items"] if r["booking_id"] == booking_id)


async def test_owner_reminds_an_awaiting_booking_once_an_hour(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, _, booking_id = await _awaiting_booking(client, db_session, "a")
    assert (await _row(client, owner, booking_id))["can_remind"] is True

    sent = await client.post(
        f"/api/v1/owner/dashboard/bookings/{booking_id}/remind", headers=auth_header(owner)
    )
    assert sent.status_code == 200
    assert sent.json()["data"]["next_reminder_in_minutes"] == 60

    # the player has the notice: the booking, the arena, that payment waits, the four methods
    notices = await client.get("/api/v1/notifications", headers=auth_header(player))
    reminder = next(n for n in notices.json()["data"]["items"] if n["event"] == "payment_reminder")
    body = reminder["body"]
    assert "Downtown Futsal Arena" in body and "Court A" in body
    assert "Payment is still waiting" in body
    assert "Card, Bank transfer, JazzCash or EasyPaisa" in body
    assert "cash on arrival" not in body.lower() and "PKR" not in body and "Rs." not in body

    # the list now says to wait, and a second try inside the hour is a 409 with the minutes left
    row = await _row(client, owner, booking_id)
    assert row["remind_wait_minutes"] in (59, 60)
    again = await client.post(
        f"/api/v1/owner/dashboard/bookings/{booking_id}/remind", headers=auth_header(owner)
    )
    assert again.status_code == 409
    assert "You can send another in" in again.json()["message"]
    assert "minute" in again.json()["message"]


async def test_another_owner_cannot_remind_someone_elses_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, _, booking_id = await _awaiting_booking(client, db_session, "b")
    stranger, _ = await make_user(client, db_session, "remind-stranger@example.com", "owner")

    resp = await client.post(
        f"/api/v1/owner/dashboard/bookings/{booking_id}/remind", headers=auth_header(stranger)
    )

    assert resp.status_code == 403


async def test_remind_only_while_awaiting_payment_and_the_slot_is_ahead(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from sqlalchemy import update

    from app.modules.booking.model import Booking, BookingStatus

    owner, player, _, booking_id = await _awaiting_booking(client, db_session, "c")
    url = f"/api/v1/owner/dashboard/bookings/{booking_id}/remind"

    # a slot that has already started: no button, and a plain 422 if asked anyway
    await db_session.execute(
        update(Booking)
        .where(Booking.id == booking_id)
        .values(booking_date=date.today() - timedelta(days=1))
    )
    await db_session.commit()
    assert (await _row(client, owner, booking_id))["can_remind"] is False
    past = await client.post(url, headers=auth_header(owner))
    assert past.status_code == 422 and "already started" in past.json()["message"]

    # a booking that is not awaiting payment (cancelled by the player)
    await db_session.execute(
        update(Booking)
        .where(Booking.id == booking_id)
        .values(booking_date=date.today() + timedelta(days=3), status=BookingStatus.cancelled)
    )
    await db_session.commit()
    assert (await _row(client, owner, booking_id))["can_remind"] is False
    gone = await client.post(url, headers=auth_header(owner))
    assert gone.status_code == 422 and "not awaiting payment" in gone.json()["message"]
