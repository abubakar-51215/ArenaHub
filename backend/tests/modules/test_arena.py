"""Arena management + admin verification flow tests.

Covers the Sprint 2 exit criterion: owner registers an arena (pending) → admin
approves/rejects → approved arenas surface in public search; RBAC + ownership
guards; blocked dates and discount codes.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def test_owner_registers_arena_pending_then_admin_approves(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "owner1@example.com", "owner")
    created = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    assert created.status_code == 201
    arena = created.json()["data"]
    assert arena["status"] == "pending"
    arena_id = arena["id"]

    # Not yet discoverable publicly.
    search = await client.get("/api/v1/arenas", params={"city": "Lahore"})
    assert all(a["id"] != arena_id for a in search.json()["data"]["items"])

    admin = await make_admin(client, db_session, "admin1@example.com")
    queue = await client.get("/api/v1/admin/arenas", headers=auth_header(admin))
    assert any(a["id"] == arena_id for a in queue.json()["data"]["items"])

    approved = await client.post(
        f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin)
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "approved"

    # Now surfaces in public search + single fetch.
    search2 = await client.get("/api/v1/arenas", params={"city": "Lahore", "sport": "futsal"})
    assert any(a["id"] == arena_id for a in search2.json()["data"]["items"])
    public = await client.get(f"/api/v1/arenas/{arena_id}")
    assert public.status_code == 200


async def test_reject_requires_reason_then_owner_resubmits(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "owner2@example.com", "owner")
    arena_id = (
        await client.post("/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload())
    ).json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin2@example.com")

    # Empty reason is rejected by schema validation.
    bad = await client.post(
        f"/api/v1/admin/arenas/{arena_id}/reject",
        headers=auth_header(admin),
        json={"reason": ""},
    )
    assert bad.status_code == 422

    rejected = await client.post(
        f"/api/v1/admin/arenas/{arena_id}/reject",
        headers=auth_header(admin),
        json={"reason": "Photos are too blurry."},
    )
    assert rejected.status_code == 200
    assert rejected.json()["data"]["status"] == "rejected"
    assert rejected.json()["data"]["rejection_reason"] == "Photos are too blurry."

    resubmitted = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/resubmit", headers=auth_header(owner)
    )
    assert resubmitted.status_code == 200
    assert resubmitted.json()["data"]["status"] == "pending"
    assert resubmitted.json()["data"]["rejection_reason"] is None


async def test_player_cannot_create_arena(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "player1@example.com", "player")
    resp = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(player), json=arena_payload()
    )
    assert resp.status_code == 403


async def test_owner_cannot_access_other_owners_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_a, _ = await make_user(client, db_session, "ownera@example.com", "owner")
    owner_b, _ = await make_user(client, db_session, "ownerb@example.com", "owner")
    arena_id = (
        await client.post(
            "/api/v1/owner/arenas", headers=auth_header(owner_a), json=arena_payload()
        )
    ).json()["data"]["id"]

    resp = await client.get(f"/api/v1/owner/arenas/{arena_id}", headers=auth_header(owner_b))
    assert resp.status_code == 403


async def test_blocked_dates_and_discounts(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "owner3@example.com", "owner")
    arena_id = (
        await client.post("/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload())
    ).json()["data"]["id"]
    h = auth_header(owner)

    blocked = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=h,
        json={"blocked_date": "2026-08-14", "reason": "Independence Day"},
    )
    assert blocked.status_code == 201
    dup = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/blocked-dates",
        headers=h,
        json={"blocked_date": "2026-08-14"},
    )
    assert dup.status_code == 409

    discount = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=h,
        json={"code": "eid25", "discount_type": "percentage", "discount_value": "25"},
    )
    assert discount.status_code == 201
    # Code is normalised to upper-case.
    assert discount.json()["data"]["code"] == "EID25"
    dup_code = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=h,
        json={"code": "EID25", "discount_type": "fixed", "discount_value": "100"},
    )
    assert dup_code.status_code == 409

    # A percentage discount over 100 is rejected by schema validation.
    bad = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=h,
        json={"code": "TOOBIG", "discount_type": "percentage", "discount_value": "150"},
    )
    assert bad.status_code == 422
