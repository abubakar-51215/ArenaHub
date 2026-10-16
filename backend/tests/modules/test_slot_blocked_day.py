"""A day the owner blocks has no slots for players, even slots made before the block:
the slot list is empty, the 7-day strip says 0 open, and checkout refuses them."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_user
from tests.modules.test_slot_past import _court, _hours


async def test_blocked_day_hides_and_refuses_existing_slots(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, court_id = await _court(client, db_session, "blocked")
    player, _ = await make_user(client, db_session, "blocked-player@example.com")
    day = date.today() + timedelta(days=3)
    rows = await _hours(db_session, court_id, day)

    court = await client.get(f"/api/v1/owner/courts/{court_id}", headers=auth_header(owner))
    arena_id = court.json()["data"]["arena_id"]
    blocked = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=auth_header(owner),
        json={"blocked_date": day.isoformat(), "reason": "Maintenance"},
    )
    assert blocked.status_code in (200, 201)

    listed = await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": day.isoformat()})
    assert listed.json()["data"] == []
    strip = await client.get(
        f"/api/v1/courts/{court_id}/availability",
        params={"from": day.isoformat(), "to": day.isoformat()},
    )
    assert strip.json()["data"] == [{"date": day.isoformat(), "open_count": 0}]
    body = {"court_id": court_id, "slot_ids": [str(rows[10].id)]}
    preview = await client.post("/api/v1/bookings/preview", headers=auth_header(player), json=body)
    assert preview.status_code == 409
    booked = await client.post(
        "/api/v1/bookings", headers=auth_header(player), json={**body, "payment_type": "full"}
    )
    assert booked.status_code == 409
    assert booked.json()["message"] == "The arena is closed on that day."
