"""Arena management + admin verification flow tests.

Covers the Sprint 2 exit criterion: owner registers an arena (pending) → admin
approves/rejects → approved arenas surface in public search; RBAC + ownership
guards; blocked dates and discount codes; trending-by-recent-bookings.
"""

from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user


def _next_weekday(target_iso_weekday: int) -> date:
    today = date.today()
    days_ahead = (target_iso_weekday - today.isoweekday()) % 7
    days_ahead = days_ahead or 7
    return today + timedelta(days=days_ahead)


async def _make_approved_arena_with_slots(
    client: AsyncClient, db_session: AsyncSession, owner_email: str, arena_name: str
) -> tuple[dict, str]:
    """Register + approve an arena, add a court, and generate a week of
    slots. Returns (owner tokens, court_id)."""
    owner, _ = await make_user(client, db_session, f"{owner_email}@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(name=arena_name)
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
    return owner, court_id


async def test_trending_ranks_arenas_by_recent_booking_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, court_a = await _make_approved_arena_with_slots(
        client, db_session, "trendowner-a", "Trending Futsal A"
    )
    _, court_b = await _make_approved_arena_with_slots(
        client, db_session, "trendowner-b", "Trending Futsal B"
    )
    player, _ = await make_user(client, db_session, "trendplayer@example.com")
    h = auth_header(player)

    monday = _next_weekday(1)
    slots_a = (
        await client.get(f"/api/v1/courts/{court_a}/slots", params={"date": monday.isoformat()})
    ).json()["data"]
    slots_b = (
        await client.get(f"/api/v1/courts/{court_b}/slots", params={"date": monday.isoformat()})
    ).json()["data"]

    # Arena A gets 3 bookings, Arena B gets 1 -> A must rank first.
    for slot in slots_a[:3]:
        await client.post(
            "/api/v1/bookings",
            headers=h,
            json={"court_id": court_a, "slot_ids": [slot["id"]], "payment_type": "full"},
        )
    await client.post(
        "/api/v1/bookings",
        headers=h,
        json={"court_id": court_b, "slot_ids": [slots_b[0]["id"]], "payment_type": "full"},
    )

    resp = await client.get("/api/v1/arenas/trending", params={"days": 7})
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()["data"]["items"]]
    assert names.index("Trending Futsal A") < names.index("Trending Futsal B")


async def test_trending_falls_back_to_popular_when_no_recent_bookings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _make_approved_arena_with_slots(client, db_session, "trendowner-c", "Trending Futsal C")

    # A 0-day window guarantees nothing qualifies as "recent" -> fallback.
    resp = await client.get("/api/v1/arenas/trending", params={"days": 1})
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()["data"]["items"]]
    assert "Trending Futsal C" in names


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


async def test_like_unlike_and_list_liked_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "likeowner1@example.com", "owner")
    h = auth_header(owner)
    arena = await client.post(
        "/api/v1/owner/arenas", headers=h, json=arena_payload(name="Likeable Arena")
    )
    arena_id = arena.json()["data"]["id"]
    admin = await make_admin(client, db_session, "admin-likeowner1@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    player, _ = await make_user(client, db_session, "likeplayer1@example.com")
    ph = auth_header(player)

    liked = await client.post(f"/api/v1/arenas/{arena_id}/like", headers=ph)
    assert liked.status_code == 200
    # Idempotent: a double-tapped heart is a no-op, not a 409.
    again = await client.post(f"/api/v1/arenas/{arena_id}/like", headers=ph)
    assert again.status_code == 200

    listed = await client.get("/api/v1/arenas/liked", headers=ph)
    assert listed.status_code == 200
    items = listed.json()["data"]["items"]
    assert [a["name"] for a in items].count("Likeable Arena") == 1

    unliked = await client.delete(f"/api/v1/arenas/{arena_id}/like", headers=ph)
    assert unliked.status_code == 200
    after = await client.get("/api/v1/arenas/liked", headers=ph)
    assert all(a["id"] != arena_id for a in after.json()["data"]["items"])

    # Another player's liked list is unaffected territory — empty for them.
    other, _ = await make_user(client, db_session, "likeplayer2@example.com")
    theirs = await client.get("/api/v1/arenas/liked", headers=auth_header(other))
    assert theirs.json()["data"]["total"] == 0


async def test_liking_unapproved_arena_404s(client: AsyncClient, db_session: AsyncSession) -> None:
    owner, _ = await make_user(client, db_session, "likeowner2@example.com", "owner")
    arena = await client.post(
        "/api/v1/owner/arenas", headers=auth_header(owner), json=arena_payload(name="Pending Arena")
    )
    arena_id = arena.json()["data"]["id"]  # still pending — never approved

    player, _ = await make_user(client, db_session, "likeplayer3@example.com")
    resp = await client.post(f"/api/v1/arenas/{arena_id}/like", headers=auth_header(player))
    assert resp.status_code == 404


async def test_liked_list_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/arenas/liked")
    assert resp.status_code == 401


async def test_owner_bank_accounts_crud_and_player_checkout_read(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bankowner1@example.com", "owner")
    h = auth_header(owner)
    arena_id = (await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())).json()[
        "data"
    ]["id"]

    # Nothing set yet — owner sees an empty list, player checkout 404s.
    empty = await client.get(f"/api/v1/owner/arenas/{arena_id}/bank-details", headers=h)
    assert empty.status_code == 200
    assert empty.json()["data"] == []

    # First account added becomes the default automatically.
    first = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/bank-details",
        headers=h,
        json={
            "label": "Meezan Main",
            "bank_name": "Meezan Bank",
            "account_title": "ArenaHub Sports",
            "account_number": "1234567890123",
            "iban": "PK36MEZN0001234567890123",
        },
    )
    assert first.status_code == 201
    first_id = first.json()["data"]["id"]
    assert first.json()["data"]["is_default"] is True

    # A second account, explicitly default → unseats the first as default.
    second = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/bank-details",
        headers=h,
        json={
            "label": "HBL Backup",
            "bank_name": "HBL",
            "account_title": "ArenaHub Sports",
            "account_number": "9876543210",
            "is_default": True,
        },
    )
    assert second.status_code == 201
    second_id = second.json()["data"]["id"]

    listed = await client.get(f"/api/v1/owner/arenas/{arena_id}/bank-details", headers=h)
    accounts = {a["id"]: a for a in listed.json()["data"]}
    assert len(accounts) == 2
    assert accounts[second_id]["is_default"] is True
    assert accounts[first_id]["is_default"] is False

    # Deactivate the first so it's hidden from checkout.
    await client.patch(
        f"/api/v1/owner/arenas/{arena_id}/bank-details/{first_id}",
        headers=h,
        json={"is_active": False},
    )

    # Another owner cannot list or edit these.
    other_owner, _ = await make_user(client, db_session, "bankowner2@example.com", "owner")
    forbidden = await client.get(
        f"/api/v1/owner/arenas/{arena_id}/bank-details", headers=auth_header(other_owner)
    )
    assert forbidden.status_code == 403

    # Pending approval → checkout 404s (arena not bookable yet).
    player, _ = await make_user(client, db_session, "bankplayer1@example.com")
    assert (
        await client.get(f"/api/v1/arenas/{arena_id}/bank-details", headers=auth_header(player))
    ).status_code == 404

    admin = await make_admin(client, db_session, "admin-bankowner1@example.com")
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))

    # Checkout returns only active accounts, default first.
    checkout = await client.get(
        f"/api/v1/arenas/{arena_id}/bank-details", headers=auth_header(player)
    )
    assert checkout.status_code == 200
    checkout_accounts = checkout.json()["data"]
    assert len(checkout_accounts) == 1  # the deactivated first is excluded
    assert checkout_accounts[0]["bank_name"] == "HBL"
    assert checkout_accounts[0]["is_default"] is True

    # Deleting the default (HBL) leaves only the inactive first account, so —
    # a default must be active — the arena is left with no default.
    await client.delete(f"/api/v1/owner/arenas/{arena_id}/bank-details/{second_id}", headers=h)
    after = await client.get(f"/api/v1/owner/arenas/{arena_id}/bank-details", headers=h)
    remaining = {a["id"]: a for a in after.json()["data"]}
    assert len(remaining) == 1
    assert remaining[first_id]["is_default"] is False  # inactive can't be default

    # Reactivating it makes it the (only active) default automatically.
    reactivated = await client.patch(
        f"/api/v1/owner/arenas/{arena_id}/bank-details/{first_id}",
        headers=h,
        json={"is_active": True},
    )
    assert reactivated.json()["data"]["is_default"] is True

    assert (await client.get(f"/api/v1/arenas/{arena_id}/bank-details")).status_code == 401


async def test_deactivating_default_bank_account_promotes_another(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "bankowner3@example.com", "owner")
    h = auth_header(owner)
    arena_id = (await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())).json()[
        "data"
    ]["id"]

    a = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/bank-details",
        headers=h,
        json={"bank_name": "Meezan", "account_title": "T", "account_number": "1"},
    )
    a_id = a.json()["data"]["id"]  # first -> default
    b = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/bank-details",
        headers=h,
        json={"bank_name": "HBL", "account_title": "T", "account_number": "2"},
    )
    b_id = b.json()["data"]["id"]

    # Deactivating the default (a) promotes the other active account (b).
    await client.patch(
        f"/api/v1/owner/arenas/{arena_id}/bank-details/{a_id}",
        headers=h,
        json={"is_active": False},
    )
    listed = {
        x["id"]: x
        for x in (
            await client.get(f"/api/v1/owner/arenas/{arena_id}/bank-details", headers=h)
        ).json()["data"]
    }
    assert listed[a_id]["is_default"] is False
    assert listed[b_id]["is_default"] is True
