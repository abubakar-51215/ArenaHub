"""Court CRUD, availability toggle, and peak-pricing rule tests."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


async def _make_arena(client: AsyncClient, owner: dict) -> str:
    resp = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    return resp.json()["data"]["id"]


async def test_court_crud_and_availability(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "cowner1@example.com", "owner")
    arena_id = await _make_arena(client, owner)
    h = auth_header(owner)

    created = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={
            "name": "Court A",
            "sport_types": ["futsal"],
            "capacity": 10,
            "base_price": "2500.00",
        },
    )
    assert created.status_code == 201
    court_id = created.json()["data"]["id"]
    assert created.json()["data"]["is_available"] is True

    toggled = await client.patch(
        f"/api/v1/owner/courts/{court_id}/availability",
        headers=h,
        json={"is_available": False},
    )
    assert toggled.status_code == 200
    assert toggled.json()["data"]["is_available"] is False

    updated = await client.patch(
        f"/api/v1/owner/courts/{court_id}", headers=h, json={"base_price": "3000.00"}
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["base_price"] == "3000.00"

    listed = await client.get(f"/api/v1/owner/arenas/{arena_id}/courts", headers=h)
    assert len(listed.json()["data"]) == 1


async def test_peak_pricing_rule_lifecycle(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "cowner2@example.com", "owner")
    arena_id = await _make_arena(client, owner)
    h = auth_header(owner)
    court_id = (
        await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": "Court B", "sport_types": ["cricket"], "base_price": "2000"},
        )
    ).json()["data"]["id"]

    rule = await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=h,
        json={
            "name": "Weekend evenings",
            "weekday": 6,
            "start_time": "18:00:00",
            "end_time": "23:00:00",
            "price_multiplier": "1.50",
        },
    )
    assert rule.status_code == 201
    rule_id = rule.json()["data"]["id"]

    # end_time before start_time is rejected.
    bad = await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=h,
        json={
            "name": "Broken",
            "start_time": "20:00:00",
            "end_time": "19:00:00",
            "price_multiplier": "2.0",
        },
    )
    assert bad.status_code == 422

    rules = await client.get(f"/api/v1/owner/courts/{court_id}/pricing-rules", headers=h)
    assert len(rules.json()["data"]) == 1

    deleted = await client.delete(
        f"/api/v1/owner/courts/{court_id}/pricing-rules/{rule_id}", headers=h
    )
    assert deleted.status_code == 200


async def test_public_pricing_rules_show_active_only_after_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "cowner4@example.com", "owner")
    arena_id = await _make_arena(client, owner)
    h = auth_header(owner)
    court_id = (
        await client.post(
            f"/api/v1/owner/arenas/{arena_id}/courts",
            headers=h,
            json={"name": "Court D", "sport_types": ["futsal"], "base_price": "2000"},
        )
    ).json()["data"]["id"]

    await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=h,
        json={
            "name": "Weekend evenings",
            "weekday": 6,
            "start_time": "18:00:00",
            "end_time": "23:00:00",
            "price_multiplier": "1.50",
        },
    )
    inactive = await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=h,
        json={
            "name": "Disabled rule",
            "start_time": "06:00:00",
            "end_time": "08:00:00",
            "price_multiplier": "1.25",
            "is_active": False,
        },
    )
    assert inactive.status_code == 201

    # Arena still pending → public pricing rules 404.
    pending = await client.get(f"/api/v1/courts/{court_id}/pricing-rules")
    assert pending.status_code == 404

    admin = await make_admin(client, db_session, "cadmin4@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    public = await client.get(f"/api/v1/courts/{court_id}/pricing-rules")
    assert public.status_code == 200
    rules = public.json()["data"]
    assert len(rules) == 1
    assert rules[0]["name"] == "Weekend evenings"
    assert rules[0]["price_multiplier"] == "1.50"


async def test_public_courts_only_after_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "cowner3@example.com", "owner")
    arena_id = await _make_arena(client, owner)
    h = auth_header(owner)
    await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court C", "sport_types": ["futsal"], "base_price": "1800"},
    )

    # Arena still pending → public court listing 404s.
    pending = await client.get(f"/api/v1/arenas/{arena_id}/courts")
    assert pending.status_code == 404

    admin = await make_admin(client, db_session, "cadmin@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    public = await client.get(f"/api/v1/arenas/{arena_id}/courts")
    assert public.status_code == 200
    assert len(public.json()["data"]) == 1
