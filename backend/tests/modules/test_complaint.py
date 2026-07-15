"""Complaint submission + admin triage lifecycle tests."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_admin, make_user


async def test_submit_and_list_own_complaint(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "cplayer1@example.com", "player")
    resp = await client.post(
        "/api/v1/complaints",
        headers=auth_header(player),
        json={"category": "booking_issue", "description": "Slot was double-booked."},
    )
    assert resp.status_code == 201
    body = resp.json()["data"]
    assert body["status"] == "open"
    assert body["category"] == "booking_issue"

    mine = await client.get("/api/v1/complaints/my", headers=auth_header(player))
    assert mine.status_code == 200
    assert mine.json()["data"]["total"] == 1


async def test_complaint_requires_auth(client: AsyncClient, db_session: AsyncSession) -> None:
    resp = await client.post(
        "/api/v1/complaints", json={"category": "other", "description": "Hello"}
    )
    assert resp.status_code == 401


async def test_non_admin_cannot_list_all_complaints(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "cplayer2@example.com", "player")
    resp = await client.get("/api/v1/admin/complaints", headers=auth_header(player))
    assert resp.status_code == 403


async def test_admin_respond_to_complaint(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "cplayer3@example.com", "player")
    created = await client.post(
        "/api/v1/complaints",
        headers=auth_header(player),
        json={"category": "payment_issue", "description": "Payment deducted twice."},
    )
    complaint_id = created.json()["data"]["id"]

    admin = await make_admin(client, db_session, "cadmin1@example.com")
    listed = await client.get("/api/v1/admin/complaints", headers=auth_header(admin))
    assert listed.status_code == 200
    assert listed.json()["data"]["total"] >= 1

    resp = await client.put(
        f"/api/v1/admin/complaints/{complaint_id}",
        headers=auth_header(admin),
        json={"admin_response": "Refund issued.", "status": "resolved"},
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["status"] == "resolved"
    assert body["admin_response"] == "Refund issued."
    assert body["resolved_at"] is not None

    logs = await client.get("/api/v1/admin/audit-logs", headers=auth_header(admin))
    assert logs.status_code == 200
    actions = [log["action"] for log in logs.json()["data"]["items"]]
    assert "complaint.respond" in actions
