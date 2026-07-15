"""Report export tests: player/owner/admin CSV+PDF downloads, with date-range
filtering on the player and owner reports."""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7
    return today + timedelta(days=days_ahead)


async def _make_confirmed_booking(
    client: AsyncClient, db_session: AsyncSession, tag: str
) -> tuple[dict, dict, date]:
    owner, _ = await make_user(client, db_session, f"repowner{tag}@example.com", "owner")
    player, _ = await make_user(client, db_session, f"repplayer{tag}@example.com", "player")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(require_full_payment=True)
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-rep{tag}@example.com")
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
    slots = (
        await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": monday.isoformat()})
    ).json()["data"]

    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    group_id = created.json()["data"]["booking_group_id"]
    payment = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group_id, "payment_method": "card"},
    )
    payment_id = payment.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    return player, owner, monday


async def test_player_bookings_report_csv(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _, monday = await _make_confirmed_booking(client, db_session, "1")

    resp = await client.get(
        "/api/v1/reports/my-bookings",
        headers=auth_header(player),
        params={"format": "csv"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    body = resp.text
    assert "Date,Time,Status,Payment Status,Amount (PKR)" in body
    assert monday.isoformat() in body

    # Filtered outside the booking's date -> header only, no data row.
    far_future = (monday + timedelta(days=365)).isoformat()
    resp_filtered = await client.get(
        "/api/v1/reports/my-bookings",
        headers=auth_header(player),
        params={"format": "csv", "date_from": far_future},
    )
    assert monday.isoformat() not in resp_filtered.text


async def test_player_bookings_report_pdf(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "reppdfplayer@example.com")
    resp = await client.get(
        "/api/v1/reports/my-bookings",
        headers=auth_header(player),
        params={"format": "pdf"},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


async def test_owner_report_lists_bookings_across_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner, monday = await _make_confirmed_booking(client, db_session, "2")

    resp = await client.get(
        "/api/v1/owner/reports", headers=auth_header(owner), params={"format": "csv"}
    )
    assert resp.status_code == 200
    assert monday.isoformat() in resp.text


async def test_owner_report_forbidden_for_players(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "repplayerforbidden@example.com")
    resp = await client.get("/api/v1/owner/reports", headers=auth_header(player))
    assert resp.status_code == 403


async def test_admin_reports_all_types_and_formats(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "repadmin@example.com")
    h = auth_header(admin)

    for report_type in ("users", "bookings", "revenue", "arenas", "system"):
        for fmt in ("csv", "pdf"):
            resp = await client.get(
                "/api/v1/admin/reports",
                headers=h,
                params={"type": report_type, "format": fmt},
            )
            assert resp.status_code == 200, (report_type, fmt, resp.text)
            if fmt == "csv":
                assert resp.headers["content-type"].startswith("text/csv")
            else:
                assert resp.content.startswith(b"%PDF")


async def test_admin_reports_forbidden_for_non_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "repnotadmin@example.com", "owner")
    resp = await client.get("/api/v1/admin/reports", headers=auth_header(owner))
    assert resp.status_code == 403


async def test_system_report_reflects_real_bookings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, monday = await _make_confirmed_booking(client, db_session, "3")
    admin = await make_admin(client, db_session, "repsysadmin@example.com")

    resp = await client.get(
        "/api/v1/admin/reports",
        headers=auth_header(admin),
        params={"type": "system", "format": "csv"},
    )
    assert resp.status_code == 200
    body = resp.text
    assert "Peak booking hours" in body
    assert "Popular sports (by bookings)" in body
    # The confirmed futsal booking must surface in the popularity ranking.
    assert "futsal" in body
    assert "No confirmed bookings yet" not in body.split("Popular sports")[1]
