"""Routes a real screen calls that no other test exercised end to end (found by the completeness
audit, docs/BACKEND_COMPLETENESS.md): log out, the password and phone changes by code, editing and
removing a discount code, and an owner's list of bookings for their own arena."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, arena_payload, auth_header, last_code, make_user

NEW_PASSWORD = "Another#Pass9"


async def test_log_out_ends_that_session(client: AsyncClient, db_session: AsyncSession) -> None:
    tokens, _ = await make_user(client, db_session, "cp-logout@example.com")
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 200

    out = await client.post(
        "/api/v1/auth/logout",
        headers=auth_header(tokens),
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert out.status_code == 200
    # the access token and the refresh token are both dead
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 401
    again = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert again.status_code == 401
    # and signing in again works
    login = await client.post(
        "/api/v1/auth/login", json={"email": "cp-logout@example.com", "password": PASSWORD}
    )
    assert login.status_code == 200


async def test_password_change_by_code_ends_other_sessions(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens, user = await make_user(client, db_session, "cp-pw@example.com")
    other = await client.post(
        "/api/v1/auth/login", json={"email": "cp-pw@example.com", "password": PASSWORD}
    )
    other_headers = {"Authorization": f"Bearer {other.json()['data']['access_token']}"}

    ask = await client.put(
        "/api/v1/users/me/password",
        headers=auth_header(tokens),
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert ask.status_code == 200
    # nothing changes until the code is confirmed
    still = await client.post(
        "/api/v1/auth/login", json={"email": "cp-pw@example.com", "password": PASSWORD}
    )
    assert still.status_code == 200

    wrong = await client.post(
        "/api/v1/users/me/password/verify", headers=auth_header(tokens), json={"code": "000000"}
    )
    assert wrong.status_code == 422
    code = last_code(user.id, OtpPurpose.password_change)
    done = await client.post(
        "/api/v1/users/me/password/verify", headers=auth_header(tokens), json={"code": code}
    )
    assert done.status_code == 200
    # every session of that account ended, the old password is dead, the new one works
    assert (await client.get("/api/v1/users/me", headers=other_headers)).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=auth_header(tokens))).status_code == 401
    old = await client.post(
        "/api/v1/auth/login", json={"email": "cp-pw@example.com", "password": PASSWORD}
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/v1/auth/login", json={"email": "cp-pw@example.com", "password": NEW_PASSWORD}
    )
    assert new.status_code == 200


async def test_phone_change_by_code(client: AsyncClient, db_session: AsyncSession) -> None:
    tokens, user = await make_user(client, db_session, "cp-phone@example.com")
    ask = await client.post(
        "/api/v1/users/me/phone", headers=auth_header(tokens), json={"new_phone": "03451112233"}
    )
    assert ask.status_code == 200
    code = last_code(user.id, OtpPurpose.phone_change)
    wrong = await client.post(
        "/api/v1/users/me/phone/verify", headers=auth_header(tokens), json={"code": "000000"}
    )
    assert wrong.status_code == 422
    done = await client.post(
        "/api/v1/users/me/phone/verify", headers=auth_header(tokens), json={"code": code}
    )
    assert done.status_code == 200 and done.json()["data"]["phone"] == "03451112233"
    me = await client.get("/api/v1/users/me", headers=auth_header(tokens))
    assert me.json()["data"]["phone"] == "03451112233"
    # a number another account holds is refused with the sign-up words
    _, other = await make_user(client, db_session, "cp-phone2@example.com")
    dup = await client.post(
        "/api/v1/users/me/phone", headers=auth_header(tokens), json={"new_phone": other.phone}
    )
    assert dup.status_code == 409
    assert dup.json()["message"] == "Phone number is already registered."


async def _owner_arena(client: AsyncClient, db: AsyncSession, email: str) -> tuple[dict, str]:
    owner, _ = await make_user(client, db, email, "owner")
    res = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    return owner, res.json()["data"]["id"]


async def test_owner_edits_and_removes_a_discount_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id = await _owner_arena(client, db_session, "cp-disc@example.com")
    base = f"/api/v1/owner/arenas/{arena_id}/discounts"
    made = await client.post(
        base,
        headers=auth_header(owner),
        json={"code": "edit10", "discount_type": "percentage", "discount_value": "10"},
    )
    assert made.status_code in (200, 201)
    code_id = made.json()["data"]["id"]
    assert made.json()["data"]["code"] == "EDIT10"

    edited = await client.patch(
        f"{base}/{code_id}",
        headers=auth_header(owner),
        json={"discount_value": "15", "max_uses": 5, "is_active": False},
    )
    assert edited.status_code == 200
    row = edited.json()["data"]
    assert row["is_active"] is False and row["max_uses"] == 5

    # another owner cannot touch it, and does not learn that it exists
    stranger, _ = await _owner_arena(client, db_session, "cp-disc2@example.com")
    for call in (
        client.patch(f"{base}/{code_id}", headers=auth_header(stranger), json={"is_active": True}),
        client.delete(f"{base}/{code_id}", headers=auth_header(stranger)),
    ):
        res = await call
        assert res.status_code in (403, 404)

    gone = await client.delete(f"{base}/{code_id}", headers=auth_header(owner))
    assert gone.status_code in (200, 204)
    rows = (await client.get(base, headers=auth_header(owner))).json()["data"]
    assert all(r["id"] != code_id for r in rows)


async def test_owner_lists_bookings_for_their_own_arena_only(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id = await _owner_arena(client, db_session, "cp-list@example.com")
    stranger, _ = await _owner_arena(client, db_session, "cp-list2@example.com")
    mine = await client.get(f"/api/v1/owner/arenas/{arena_id}/bookings", headers=auth_header(owner))
    assert mine.status_code == 200
    theirs = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/bookings", headers=auth_header(stranger)
    )
    assert theirs.status_code in (403, 404)
    anyone = await client.get(f"/api/v1/owner/arenas/{arena_id}/bookings")
    assert anyone.status_code == 401
    assert (await repo.get_user_by_email(db_session, "cp-list@example.com")) is not None


async def test_owner_court_pricing_rule_and_equipment_edits(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id = await _owner_arena(client, db_session, "cp-edit@example.com")
    h = auth_header(owner)
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=h,
        json={"name": "Court Z", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    rule = await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=h,
        json={
            "name": "Evenings",
            "start_time": "18:00:00",
            "end_time": "22:00:00",
            "price_multiplier": "1.50",
        },
    )
    rule_id = rule.json()["data"]["id"]
    changed = await client.patch(
        f"/api/v1/owner/courts/{court_id}/pricing-rules/{rule_id}",
        headers=h,
        json={"price_multiplier": "1.75"},
    )
    assert changed.status_code == 200
    assert str(changed.json()["data"]["price_multiplier"]).startswith("1.75")

    item = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=h,
        json={"name": "Bibs", "rental_price": "50.00", "quantity_total": 10},
    )
    item_id = item.json()["data"]["id"]
    renamed = await client.patch(
        f"/api/v1/owner/equipment/{item_id}", headers=h, json={"name": "Bibs (set of 10)"}
    )
    assert renamed.status_code == 200 and renamed.json()["data"]["name"] == "Bibs (set of 10)"
    removed = await client.delete(f"/api/v1/owner/equipment/{item_id}", headers=h)
    assert removed.status_code in (200, 204)

    gone = await client.delete(f"/api/v1/owner/courts/{court_id}", headers=h)
    assert gone.status_code in (200, 204)
    again = await client.get(f"/api/v1/owner/arenas/{arena_id}/courts", headers=h)
    assert all(c["id"] != court_id for c in again.json()["data"])


async def test_owner_blocked_dates_list_and_remove(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id = await _owner_arena(client, db_session, "cp-block@example.com")
    h = auth_header(owner)
    base = f"/api/v1/owner/arenas/{arena_id}/blocked-dates"
    made = await client.post(base, headers=h, json={"blocked_date": "2030-01-15", "reason": "Rain"})
    assert made.status_code in (200, 201)
    listed = await client.get(base, headers=h)
    assert listed.status_code == 200 and len(listed.json()["data"]) == 1
    blocked_id = listed.json()["data"][0]["id"]
    stranger, _ = await _owner_arena(client, db_session, "cp-block2@example.com")
    assert (
        await client.delete(f"{base}/{blocked_id}", headers=auth_header(stranger))
    ).status_code in (
        403,
        404,
    )
    gone = await client.delete(f"{base}/{blocked_id}", headers=h)
    assert gone.status_code in (200, 204)
    assert (await client.get(base, headers=h)).json()["data"] == []


async def test_admin_reads_one_arena_and_one_complaint(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.helpers import make_admin

    _, arena_id = await _owner_arena(client, db_session, "cp-admin-arena@example.com")
    admin = await make_admin(client, db_session, "cp-admin@example.com")
    detail = await client.get(f"/api/v1/admin/arenas/{arena_id}", headers=auth_header(admin))
    assert detail.status_code == 200 and detail.json()["data"]["id"] == arena_id

    player, _ = await make_user(client, db_session, "cp-complainer@example.com")
    sent = await client.post(
        "/api/v1/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "The floor was wet."},
    )
    complaint_id = sent.json()["data"]["id"]
    one = await client.get(f"/api/v1/admin/complaints/{complaint_id}", headers=auth_header(admin))
    assert one.status_code == 200 and one.json()["data"]["id"] == complaint_id
    # a player cannot read the admin view of it, and a stranger cannot see someone else's complaint
    assert (
        await client.get(f"/api/v1/admin/complaints/{complaint_id}", headers=auth_header(player))
    ).status_code == 403
    other, _ = await make_user(client, db_session, "cp-other@example.com")
    peek = await client.get(f"/api/v1/complaints/{complaint_id}", headers=auth_header(other))
    assert peek.status_code in (403, 404)
