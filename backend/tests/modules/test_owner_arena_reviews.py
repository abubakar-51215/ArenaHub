"""Owner-scoped arena reviews: an owner can read reviews for their own arenas,
including deactivated ones. The public endpoint keeps its approved-and-active
rule, so a deactivated arena is still hidden from players.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def _owner_arena(client: AsyncClient, db_session: AsyncSession, email: str):
    owner, _ = await make_user(client, db_session, email, "owner")
    created = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    arena_id = created.json()["data"]["id"]
    admin = await make_admin(client, db_session, f"admin-{email}")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    return owner, arena_id


async def test_owner_reads_reviews_for_own_active_arena(client, db_session):
    owner, arena_id = await _owner_arena(client, db_session, "ownrev-active@example.com")

    res = await client.get(f"/api/v1/owner/arenas/{arena_id}/reviews", headers=auth_header(owner))

    assert res.status_code == 200
    assert res.json()["data"]["items"] == []


async def test_owner_still_reads_reviews_after_deactivating_arena(client, db_session):
    owner, arena_id = await _owner_arena(client, db_session, "ownrev-deact@example.com")
    deactivated = await client.delete(f"/api/v1/owner/arenas/{arena_id}", headers=auth_header(owner))
    assert deactivated.status_code == 200

    owner_view = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/reviews", headers=auth_header(owner)
    )
    public_view = await client.get(f"/api/v1/arenas/{arena_id}/reviews")

    assert owner_view.status_code == 200
    assert public_view.status_code == 404


async def test_other_owner_gets_not_found(client, db_session):
    _, arena_id = await _owner_arena(client, db_session, "ownrev-a@example.com")
    other, _ = await make_user(client, db_session, "ownrev-b@example.com", "owner")

    res = await client.get(f"/api/v1/owner/arenas/{arena_id}/reviews", headers=auth_header(other))

    assert res.status_code == 404
