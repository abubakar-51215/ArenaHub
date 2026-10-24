"""Complaint status steps: Open -> Under review -> Resolved, and back from Under review to Open.
Only an admin moves a complaint; the player is told; a resolved complaint stays resolved."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.messages import COMPLAINT_MOVE_NOT_ALLOWED
from app.modules.admin.model import AuditLog
from tests.helpers import auth_header, make_admin, make_user


async def _complaint(client: AsyncClient, db: AsyncSession, tag: str) -> tuple[dict, str, dict]:
    player, _ = await make_user(client, db, f"cs-player-{tag}@example.com", "player")
    made = await client.post(
        "/api/v1/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "Please help."},
    )
    admin = await make_admin(client, db, f"cs-admin-{tag}@example.com")
    return player, made.json()["data"]["id"], admin


async def _move(client: AsyncClient, admin: dict, cid: str, status: str):
    return await client.patch(
        f"/api/v1/admin/complaints/{cid}/status",
        headers=auth_header(admin),
        json={"status": status},
    )


async def _notices(client: AsyncClient, player: dict) -> list[dict]:
    got = await client.get("/api/v1/notifications", headers=auth_header(player))
    return [n for n in got.json()["data"]["items"] if n["event"] == "complaint_status"]


async def test_the_allowed_moves_work_and_the_player_sees_each_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, cid, admin = await _complaint(client, db_session, "walk")

    async def mine() -> str:
        got = await client.get(f"/api/v1/complaints/{cid}", headers=auth_header(player))
        return got.json()["data"]["status"]

    assert await mine() == "open"
    for target in ("under_review", "open", "under_review", "resolved"):
        done = await _move(client, admin, cid, target)
        assert done.status_code == 200, (target, done.text)
        assert done.json()["data"]["status"] == target
        assert await mine() == target
    resolved = (await _move(client, admin, cid, "resolved")).json()["data"]
    assert resolved["resolved_at"] is not None and resolved["assigned_to"] is not None


async def test_open_can_go_straight_to_resolved(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, cid, admin = await _complaint(client, db_session, "skip")
    done = await _move(client, admin, cid, "resolved")
    assert done.status_code == 200 and done.json()["data"]["status"] == "resolved"


@pytest.mark.parametrize("target", ["open", "under_review"])
async def test_a_resolved_complaint_cannot_be_moved_back(
    client: AsyncClient, db_session: AsyncSession, target: str
) -> None:
    _, cid, admin = await _complaint(client, db_session, f"final-{target}")
    await _move(client, admin, cid, "resolved")
    refused = await _move(client, admin, cid, target)
    assert refused.status_code == 422 and COMPLAINT_MOVE_NOT_ALLOWED in refused.text
    # the reply form cannot reopen it either
    via_reply = await client.put(
        f"/api/v1/admin/complaints/{cid}",
        headers=auth_header(admin),
        json={"admin_response": "Reopening.", "status": target},
    )
    assert via_reply.status_code == 422
    still = await client.get(f"/api/v1/admin/complaints/{cid}", headers=auth_header(admin))
    assert still.json()["data"]["status"] == "resolved"


async def test_only_an_admin_can_change_a_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, cid, admin = await _complaint(client, db_session, "who")
    owner, _ = await make_user(client, db_session, "cs-owner-who@example.com", "owner")
    for who in (auth_header(player), auth_header(owner), {}):
        got = await client.patch(
            f"/api/v1/admin/complaints/{cid}/status", headers=who, json={"status": "under_review"}
        )
        assert got.status_code in (401, 403)
    # a player cannot do it through the reply route either
    sneaky = await client.put(
        f"/api/v1/admin/complaints/{cid}",
        headers=auth_header(player),
        json={"admin_response": "x", "status": "resolved"},
    )
    assert sneaky.status_code == 403
    after = await client.get(f"/api/v1/complaints/{cid}", headers=auth_header(player))
    assert after.json()["data"]["status"] == "open"
    assert (await _move(client, admin, cid, "nonsense")).status_code == 422
    missing = await _move(client, admin, "00000000-0000-0000-0000-000000000000", "resolved")
    assert missing.status_code == 404


async def test_the_player_is_told_once_per_real_move_and_the_move_is_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, cid, admin = await _complaint(client, db_session, "notice")
    await _move(client, admin, cid, "under_review")
    await _move(client, admin, cid, "under_review")  # second click: nothing new
    notices = await _notices(client, player)
    assert len(notices) == 1
    assert notices[0]["data"]["complaint_id"] == cid
    assert notices[0]["title"] == "Your complaint was updated"
    assert "Under review" in notices[0]["body"]
    await _move(client, admin, cid, "resolved")
    assert len(await _notices(client, player)) == 2
    logged = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "complaint.status", AuditLog.target_id == cid)
    )
    assert len(logged.scalars().all()) == 2


async def test_the_list_can_be_filtered_by_each_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, cid, admin = await _complaint(client, db_session, "filter")
    await _move(client, admin, cid, "under_review")
    got = await client.get(
        "/api/v1/admin/complaints", headers=auth_header(admin), params={"status": "under_review"}
    )
    assert [c["id"] for c in got.json()["data"]["items"]] == [cid]
    none = await client.get(
        "/api/v1/admin/complaints", headers=auth_header(admin), params={"status": "open"}
    )
    assert none.json()["data"]["items"] == []
