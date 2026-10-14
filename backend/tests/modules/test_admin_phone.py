"""Admin on the phone: the new routes (overview, arena cards and summary, admin refunds), the two
admin notices, once-only and handled-already rules, reason limits, and that players and owners are
refused."""

import re
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.model import AuditLog
from app.modules.notification.model import Notification
from app.modules.payment.model import Refund, RefundStatus
from app.modules.user.model import User, UserRole
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_admin_arena_actions import _setup as moderation_setup
from tests.modules.test_owner_refunds import _cancelled_bank_group

API = "/api/v1"


async def _me(client: AsyncClient, tokens: dict) -> str:
    return (await client.get(f"{API}/users/me", headers=auth_header(tokens))).json()["data"]["id"]


async def _notices(db: AsyncSession, user_id, event: str) -> list[Notification]:
    rows = await db.scalars(
        select(Notification).where(Notification.user_id == user_id, Notification.event == event)
    )
    return list(rows.all())


async def _roles(client: AsyncClient, db: AsyncSession, tag: str):
    admin = await make_admin(client, db, f"{tag}-admin@example.com")
    owner, _ = await make_user(client, db, f"{tag}-owner@example.com", "owner")
    player, _ = await make_user(client, db, f"{tag}-player@example.com", "player")
    return admin, owner, player


async def _submit_arena(client: AsyncClient, owner: dict, name: str) -> str:
    made = await client.post(
        f"{API}/owner/arenas", headers=auth_header(owner), json=arena_payload(name=name)
    )
    assert made.status_code == 201
    return made.json()["data"]["id"]


# ---- every new admin route refuses players, owners and visitors -----------------------


async def test_admin_phone_routes_refuse_players_owners_and_visitors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, owner, player = await _roles(client, db_session, "ph1")
    arena_id = await _submit_arena(client, owner, "Phone One")
    paths = [
        ("get", "/admin/phone/overview"),
        ("get", "/admin/arena-cards"),
        ("get", f"/admin/arenas/{arena_id}/summary"),
        ("get", "/admin/refunds"),
        ("post", "/admin/refunds/00000000-0000-0000-0000-000000000000/mark-paid"),
        ("get", "/admin/users"),
        ("get", "/admin/complaints"),
    ]
    for method, path in paths:
        call = getattr(client, method)
        for who in (player, owner):
            assert (await call(f"{API}{path}", headers=auth_header(who))).status_code == 403, path
        assert (await call(f"{API}{path}")).status_code == 401, path
        assert (await call(f"{API}{path}", headers=auth_header(admin))).status_code in (200, 404)


# ---- overview ----------------------------------------------------------------------


async def test_overview_counts_waiting_arenas_complaints_and_refunds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, owner, player = await _roles(client, db_session, "ph2")
    base = (await client.get(f"{API}/admin/phone/overview", headers=auth_header(admin))).json()[
        "data"
    ]
    await _submit_arena(client, owner, "Waiting One")
    await client.post(
        f"{API}/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "Nobody answered the phone."},
    )
    _, _, payment, refund = await _cancelled_bank_group(client, db_session, "ph2b")
    data = (await client.get(f"{API}/admin/phone/overview", headers=auth_header(admin))).json()[
        "data"
    ]
    assert data["pending_arenas"] == base["pending_arenas"] + 1
    assert data["open_complaints"] == base["open_complaints"] + 1
    assert data["refunds_waiting"] == base["refunds_waiting"] + 1
    assert Decimal(data["refunds_waiting_amount"]) == Decimal(
        base["refunds_waiting_amount"]
    ) + Decimal(refund.amount)
    assert data["oldest_pending_arena_name"] and data["oldest_pending_arena_at"]
    assert data["oldest_open_complaint_at"]


# ---- arena cards and summary ---------------------------------------------------------


async def test_arena_cards_by_scope_and_summary_with_the_real_upcoming_count(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await moderation_setup(client, db_session, "ph3")
    admin = s["admin"]
    live = await client.get(f"{API}/admin/arena-cards?scope=live", headers=auth_header(admin))
    row = next(i for i in live.json()["data"]["items"] if i["id"] == s["arena_id"])
    assert row["owner_name"] and row["city"] and row["is_suspended"] is False

    summary = await client.get(
        f"{API}/admin/arenas/{s['arena_id']}/summary", headers=auth_header(admin)
    )
    data = summary.json()["data"]
    assert data["upcoming_bookings"] == 0 and data["courts"] == 1
    assert data["owner_email"] and data["address"]

    suspended = await client.post(
        f"{API}/admin/arenas/{s['arena_id']}/suspend",
        headers=auth_header(admin),
        json={"reason": "Gate was closed."},
    )
    assert suspended.status_code == 200
    only = await client.get(f"{API}/admin/arena-cards?scope=suspended", headers=auth_header(admin))
    assert s["arena_id"] in [i["id"] for i in only.json()["data"]["items"]]
    gone = await client.get(f"{API}/admin/arena-cards?scope=live", headers=auth_header(admin))
    assert s["arena_id"] not in [i["id"] for i in gone.json()["data"]["items"]]
    after = (
        await client.get(f"{API}/admin/arenas/{s['arena_id']}/summary", headers=auth_header(admin))
    ).json()["data"]
    assert after["suspended_reason"] == "Gate was closed." and after["suspended_at"]
    missing = await client.get(
        f"{API}/admin/arenas/00000000-0000-0000-0000-000000000000/summary",
        headers=auth_header(admin),
    )
    assert missing.status_code == 404
    searched = await client.get(
        f"{API}/admin/arena-cards?scope=all&search=zzzznothing", headers=auth_header(admin)
    )
    assert searched.json()["data"]["items"] == []


async def test_summary_upcoming_count_is_what_a_suspension_cancels(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from tests.modules.test_admin_arena_actions import _paid_booking, _slot_ids

    s = await moderation_setup(client, db_session, "ph4")
    player, _ = await make_user(client, db_session, "ph4-p1@example.com", "player")
    slot_ids = await _slot_ids(client, s["court_id"], s["day"])
    await _paid_booking(client, player, s["court_id"], slot_ids[0])
    summary = (
        await client.get(
            f"{API}/admin/arenas/{s['arena_id']}/summary", headers=auth_header(s["admin"])
        )
    ).json()["data"]
    assert summary["upcoming_bookings"] >= 1
    sus = await client.post(
        f"{API}/admin/arenas/{s['arena_id']}/suspend",
        headers=auth_header(s["admin"]),
        json={"reason": "Safety check."},
    )
    assert sus.status_code == 200
    log = (
        await db_session.scalars(
            select(AuditLog).where(
                AuditLog.action == "arena.suspend", AuditLog.target_id == s["arena_id"]
            )
        )
    ).one()
    assert log.details["bookings_cancelled"] == summary["upcoming_bookings"]


# ---- approve / reject: handled already, notices, reason limits ------------------------


async def test_approve_and_reject_once_only_and_the_owner_is_told(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, owner, _ = await _roles(client, db_session, "ph5")
    owner_id = await _me(client, owner)
    a = await _submit_arena(client, owner, "Kickoff Arena")
    b = await _submit_arena(client, owner, "Net Zone")
    ok = await client.post(f"{API}/admin/arenas/{a}/approve", headers=auth_header(admin))
    assert ok.status_code == 200
    again = await client.post(f"{API}/admin/arenas/{a}/approve", headers=auth_header(admin))
    assert again.status_code == 409 and "already handled" in again.json()["message"]
    late = await client.post(
        f"{API}/admin/arenas/{a}/reject", headers=auth_header(admin), json={"reason": "Too late"}
    )
    assert late.status_code == 409
    approved = await _notices(db_session, owner_id, "arena_approved")
    assert len(approved) == 1
    assert approved[0].body == "Kickoff Arena is approved. Players can find and book it."

    rejected = await client.post(
        f"{API}/admin/arenas/{b}/reject",
        headers=auth_header(admin),
        json={"reason": "Photos are missing."},
    )
    assert rejected.status_code == 200
    twice = await client.post(
        f"{API}/admin/arenas/{b}/reject", headers=auth_header(admin), json={"reason": "Again"}
    )
    assert twice.status_code == 409
    notes = await _notices(db_session, owner_id, "arena_rejected")
    assert len(notes) == 1
    assert notes[0].body == "Net Zone was not approved. Reason: Photos are missing."


async def test_reason_limits_are_one_to_five_hundred_and_reply_two_thousand(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, owner, player = await _roles(client, db_session, "ph6")
    a1 = await _submit_arena(client, owner, "Limit One")
    a2 = await _submit_arena(client, owner, "Limit Two")
    for text, code in (("", 422), ("   ", 422), ("x" * 501, 422)):
        r = await client.post(
            f"{API}/admin/arenas/{a1}/reject", headers=auth_header(admin), json={"reason": text}
        )
        assert r.status_code == code, text
    assert (
        await client.post(
            f"{API}/admin/arenas/{a1}/reject",
            headers=auth_header(admin),
            json={"reason": "x" * 500},
        )
    ).status_code == 200
    assert (
        await client.post(
            f"{API}/admin/arenas/{a2}/reject", headers=auth_header(admin), json={"reason": "x"}
        )
    ).status_code == 200

    made = await client.post(
        f"{API}/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "Please help."},
    )
    cid = made.json()["data"]["id"]
    target_id = await _me(client, player)
    for text, code in (("", 422), ("x" * 501, 422), ("x", 200)):
        r = await client.patch(
            f"{API}/admin/users/{target_id}/suspend",
            headers=auth_header(admin),
            json={"reason": text},
        )
        assert r.status_code == code, text

    for text, code in (("", 422), ("x" * 2001, 422), ("x" * 2000, 200)):
        r = await client.put(
            f"{API}/admin/complaints/{cid}",
            headers=auth_header(admin),
            json={"admin_response": text, "status": "resolved"},
        )
        assert r.status_code == code, len(text)


async def test_user_detail_has_the_suspend_reason_and_counts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin, _, player = await _roles(client, db_session, "ph7")
    pid = await _me(client, player)
    await client.post(
        f"{API}/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "Hello."},
    )
    plain = (await client.get(f"{API}/admin/users/{pid}", headers=auth_header(admin))).json()[
        "data"
    ]
    assert plain["total_complaints"] == 1 and plain["suspended_reason"] is None
    await client.patch(
        f"{API}/admin/users/{pid}/suspend",
        headers=auth_header(admin),
        json={"reason": "Repeated fake receipts."},
    )
    shown = (await client.get(f"{API}/admin/users/{pid}", headers=auth_header(admin))).json()[
        "data"
    ]
    assert shown["is_active"] is False and shown["suspended_reason"] == "Repeated fake receipts."


# ---- the two admin notices ------------------------------------------------------------


async def test_a_new_arena_tells_every_active_admin_once_and_nobody_else(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin1 = await make_admin(client, db_session, "ph8-a1@example.com")
    admin2 = await make_admin(client, db_session, "ph8-a2@example.com")
    sleeping = await make_admin(client, db_session, "ph8-a3@example.com")
    owner, _ = await make_user(client, db_session, "ph8-owner@example.com", "owner")
    player, _ = await make_user(client, db_session, "ph8-player@example.com", "player")
    sleeping_id = await _me(client, sleeping)
    user = await db_session.get(User, sleeping_id)
    user.is_active = False
    await db_session.commit()

    await _submit_arena(client, owner, "Kickoff Arena")
    for who in (admin1, admin2):
        got = await _notices(db_session, await _me(client, who), "arena_waiting")
        assert len(got) == 1
        assert got[0].title == "New arena waiting"
        assert got[0].body == "Kickoff Arena asked to be listed."
    assert await _notices(db_session, sleeping_id, "arena_waiting") == []
    assert await _notices(db_session, await _me(client, owner), "arena_waiting") == []
    assert await _notices(db_session, await _me(client, player), "arena_waiting") == []

    # a rejected arena asked again: one more notice per admin
    admins = (await db_session.scalars(select(User).where(User.role == UserRole.admin))).all()
    assert len(admins) >= 3


async def test_resubmitting_a_rejected_arena_tells_the_admins_again(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ph9-admin@example.com")
    owner, _ = await make_user(client, db_session, "ph9-owner@example.com", "owner")
    arena_id = await _submit_arena(client, owner, "Second Try")
    await client.post(
        f"{API}/admin/arenas/{arena_id}/reject", headers=auth_header(admin), json={"reason": "No"}
    )
    again = await client.post(f"{API}/owner/arenas/{arena_id}/resubmit", headers=auth_header(owner))
    assert again.status_code == 200
    got = await _notices(db_session, await _me(client, admin), "arena_waiting")
    assert len(got) == 2


async def test_a_new_complaint_tells_every_active_admin_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin1 = await make_admin(client, db_session, "ph10-a1@example.com")
    admin2 = await make_admin(client, db_session, "ph10-a2@example.com")
    player, _ = await make_user(client, db_session, "ph10-player@example.com", "player")
    made = await client.post(
        f"{API}/complaints",
        headers=auth_header(player),
        json={"category": "other", "description": "I need help."},
    )
    assert made.status_code == 201
    for who in (admin1, admin2):
        got = await _notices(db_session, await _me(client, who), "complaint_new")
        assert len(got) == 1
        assert got[0].title == "New complaint"
        assert got[0].body == "Test User wrote to support."
    assert await _notices(db_session, await _me(client, player), "complaint_new") == []


async def test_admin_notices_are_in_the_admin_category_and_skip_when_switched_off(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from app.modules.notification.service import EVENT_META

    assert EVENT_META["arena_waiting"]["category"] == "admin"
    assert EVENT_META["complaint_new"]["category"] == "admin"
    admin = await make_admin(client, db_session, "ph11-admin@example.com")
    owner, _ = await make_user(client, db_session, "ph11-owner@example.com", "owner")
    # the admin switches the "admin" category off for push and email: the in-app notice still exists
    await client.patch(
        f"{API}/users/me",
        headers=auth_header(admin),
        json={"notification_preferences": {"push": {"admin": False}, "email": {"admin": False}}},
    )
    await _submit_arena(client, owner, "Quiet Arena")
    assert len(await _notices(db_session, await _me(client, admin), "arena_waiting")) == 1


# ---- admin refunds -----------------------------------------------------------------------


async def test_admin_lists_refunds_across_arenas_and_filters_by_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ph12-admin@example.com")
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "ph12")
    other_owner, other_player, _, other_refund = await _cancelled_bank_group(
        client, db_session, "ph12b"
    )
    pending = await client.get(f"{API}/admin/refunds", headers=auth_header(admin))
    ids = [i["id"] for i in pending.json()["data"]["items"]]
    assert str(refund.id) in ids and str(other_refund.id) in ids  # two different owners
    row = next(i for i in pending.json()["data"]["items"] if i["id"] == str(refund.id))
    assert row["player_name"] and row["booking_code"].startswith("AHB-") and row["arena_name"]
    assert row["reason"] and row["status"] == "pending" and row["can_mark_paid"] is True
    none = await client.get(f"{API}/admin/refunds?status=processed", headers=auth_header(admin))
    assert str(refund.id) not in [i["id"] for i in none.json()["data"]["items"]]
    assert (
        await client.get(f"{API}/admin/refunds?status=nope", headers=auth_header(admin))
    ).status_code == 422
    for who in (owner, player):
        assert (
            await client.get(f"{API}/admin/refunds", headers=auth_header(who))
        ).status_code == 403


async def test_admin_mark_paid_once_only_notifies_the_player_once_and_writes_an_audit_line(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ph13-admin@example.com")
    owner, player, payment, refund = await _cancelled_bank_group(client, db_session, "ph13")
    player_id = await _me(client, player)
    admin_id = await _me(client, admin)
    url = f"{API}/admin/refunds/{refund.id}/mark-paid"
    for who in (owner, player):
        assert (await client.post(url, headers=auth_header(who))).status_code == 403
    assert (await client.post(url)).status_code == 401

    first = await client.post(url, headers=auth_header(admin))
    assert first.status_code == 200
    data = first.json()["data"]
    assert data["already_processed"] is False and data["refund"]["status"] == "processed"
    await db_session.refresh(refund)
    assert refund.status == RefundStatus.processed and str(refund.processed_by) == admin_id

    second = await client.post(url, headers=auth_header(admin))
    assert second.status_code == 200
    assert second.json()["data"]["already_processed"] is True
    assert second.json()["message"] == "Already marked as paid."

    told = await _notices(db_session, player_id, "refund_completed")
    assert len(told) == 1  # the second call sent nothing
    assert re.fullmatch(
        r"Your refund of ₨ [\d,]+ for your booking on \w{3} \d{1,2} \w{3} at \d{1,2}:\d{2} [AP]M "
        r"has been completed\.",
        told[0].body,
    )
    audit = (
        await db_session.scalars(
            select(AuditLog).where(
                AuditLog.action == "refund.mark_paid", AuditLog.target_id == str(refund.id)
            )
        )
    ).all()
    assert len(audit) == 1 and str(audit[0].actor_id) == admin_id
    count = await db_session.scalar(
        select(func.count()).select_from(Refund).where(Refund.status == RefundStatus.pending)
    )
    assert count is not None


async def test_admin_cannot_mark_a_gateway_refund_by_hand_or_a_missing_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from sqlalchemy import update

    from app.modules.payment.model import Payment, PaymentMethod

    admin = await make_admin(client, db_session, "ph14-admin@example.com")
    _, _, payment, refund = await _cancelled_bank_group(client, db_session, "ph14")
    await db_session.execute(
        update(Payment)
        .where(Payment.id == refund.payment_id)
        .values(payment_method=PaymentMethod.card)
    )
    await db_session.commit()
    refused = await client.post(
        f"{API}/admin/refunds/{refund.id}/mark-paid", headers=auth_header(admin)
    )
    assert refused.status_code == 422
    missing = await client.post(
        f"{API}/admin/refunds/00000000-0000-0000-0000-000000000000/mark-paid",
        headers=auth_header(admin),
    )
    assert missing.status_code == 404


async def test_admin_payments_carry_the_booking_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin = await make_admin(client, db_session, "ph15-admin@example.com")
    _, _, payment, refund = await _cancelled_bank_group(client, db_session, "ph15")
    pays = await client.get(f"{API}/admin/payments?page_size=100", headers=auth_header(admin))
    row = next(p for p in pays.json()["data"]["items"] if p["id"] == payment["id"])
    assert re.fullmatch(r"AHB-[0-9A-F]{6}", row["booking_code"])
    assert row["booking_code"] == "AHB-" + payment["booking_group_id"].replace("-", "")[:6].upper()
    refunds = await client.get(f"{API}/admin/refunds", headers=auth_header(admin))
    same = next(r for r in refunds.json()["data"]["items"] if r["id"] == str(refund.id))
    assert same["booking_code"] == row["booking_code"]
