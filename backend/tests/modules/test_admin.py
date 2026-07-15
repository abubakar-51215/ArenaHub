"""Admin panel expansion tests: user management, platform-wide monitoring,
dashboard metrics, and the audit log."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_admin, make_user


async def test_non_admin_cannot_list_users(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "auser1@example.com", "player")
    resp = await client.get("/api/v1/admin/users", headers=auth_header(player))
    assert resp.status_code == 403


async def test_admin_lists_and_filters_users(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await make_admin(client, db_session, "aadmin1@example.com")
    await make_user(client, db_session, "auser2@example.com", "player")
    await make_user(client, db_session, "aowner1@example.com", "owner")

    resp = await client.get("/api/v1/admin/users?role=owner", headers=auth_header(admin))
    assert resp.status_code == 200
    items = resp.json()["data"]["items"]
    assert all(u["role"] == "owner" for u in items)
    assert any(u["email"] == "aowner1@example.com" for u in items)


async def test_admin_suspend_and_reactivate_user(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "aadmin2@example.com")
    _, user = await make_user(client, db_session, "auser3@example.com", "player")

    suspend = await client.patch(
        f"/api/v1/admin/users/{user.id}/suspend",
        headers=auth_header(admin),
        json={"reason": "Reported for abusive behavior."},
    )
    assert suspend.status_code == 200
    assert suspend.json()["data"]["is_active"] is False

    detail = await client.get(f"/api/v1/admin/users/{user.id}", headers=auth_header(admin))
    assert detail.status_code == 200
    assert detail.json()["data"]["is_active"] is False

    reactivate = await client.patch(
        f"/api/v1/admin/users/{user.id}/reactivate", headers=auth_header(admin)
    )
    assert reactivate.status_code == 200
    assert reactivate.json()["data"]["is_active"] is True

    logs = await client.get("/api/v1/admin/audit-logs", headers=auth_header(admin))
    actions = [log["action"] for log in logs.json()["data"]["items"]]
    assert "user.suspend" in actions
    assert "user.reactivate" in actions


async def test_admin_dashboard_metrics(client: AsyncClient, db_session: AsyncSession) -> None:
    admin = await make_admin(client, db_session, "aadmin3@example.com")
    resp = await client.get("/api/v1/admin/dashboard", headers=auth_header(admin))
    assert resp.status_code == 200
    data = resp.json()["data"]
    for key in (
        "total_players",
        "total_owners",
        "total_arenas",
        "bookings_today",
        "bookings_this_month",
        "bookings_all_time",
        "total_revenue",
        "active_complaints",
    ):
        assert key in data


async def test_admin_bookings_and_payments_are_empty_lists_by_default(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "aadmin4@example.com")
    bookings = await client.get("/api/v1/admin/bookings", headers=auth_header(admin))
    assert bookings.status_code == 200
    assert "items" in bookings.json()["data"]

    payments = await client.get("/api/v1/admin/payments", headers=auth_header(admin))
    assert payments.status_code == 200
    assert "items" in payments.json()["data"]


async def test_admin_platform_settings_defaults_then_updates(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "aadmin5@example.com")

    defaults = await client.get("/api/v1/admin/settings", headers=auth_header(admin))
    assert defaults.status_code == 200
    assert defaults.json()["data"]["site_name"] == "Arena Hub"

    updated = await client.put(
        "/api/v1/admin/settings",
        headers=auth_header(admin),
        json={
            "site_name": "Arena Hub PK",
            "site_description": "Updated description.",
            "site_email": "ops@arenahub.pk",
            "site_phone": "0300-1234567",
            "address": "Lahore, Pakistan",
            "default_currency": "PKR",
            "timezone": "Asia/Karachi",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["site_name"] == "Arena Hub PK"

    refetched = await client.get("/api/v1/admin/settings", headers=auth_header(admin))
    assert refetched.json()["data"]["site_name"] == "Arena Hub PK"
