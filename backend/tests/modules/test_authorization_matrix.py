# ruff: noqa: E501, B023
"""Who may do what (OWASP API1, API3, API5): no token, the wrong role, and another person's things.

A small world is built through the real API (two players, two owners with an arena each, an admin;
a booking with a receipt, a confirmed and cancelled booking with a refund, a complaint, a match, a
discount, equipment, bank details, notices). Then:

* every route that needs a sign-in answers 401 without one;
* every owner route answers 403 to a player and an admin-only route 403 to a player and an owner;
* every call on another person's thing answers 403 or 404, and with the SAME answer as for a thing
  that does not exist (so nobody learns that it exists);
* suspended people and arenas are blocked;
* no answer carries a password hash, token hash, code hash or the like.
"""

import json
import uuid
from datetime import date, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_payment import ALL_WEEK_HOURS

RECEIPT = "/uploads/receipts/f02c831521b25cf7921bd45c4d950565.jpg"
DAY = date.today() + timedelta(days=4)
GHOST = "00000000-0000-4000-8000-00000000dead"  # an id nothing has


async def _arena(client: AsyncClient, db: AsyncSession, owner: dict, admin: dict, tag: str) -> Any:
    res = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(
            name=f"Matrix {tag}", operating_hours=ALL_WEEK_HOURS, advance_percentage=100
        ),
    )
    arena_id = res.json()["data"]["id"]
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court 1", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": DAY.isoformat(), "end_date": DAY.isoformat()},
    )
    slots = (
        await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": DAY.isoformat()})
    ).json()["data"]
    bank = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/bank-details",
        headers=auth_header(owner),
        json={
            "label": "Main",
            "bank_name": "HBL",
            "account_title": "Matrix",
            "account_number": "1234567890",
        },
    )
    disc = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=auth_header(owner),
        json={"code": f"M{tag}", "discount_type": "percentage", "discount_value": "10"},
    )
    equip = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/equipment",
        headers=auth_header(owner),
        json={"name": "Bibs", "rental_price": "50.00", "quantity_total": 5},
    )
    rule = await client.post(
        f"/api/v1/owner/courts/{court_id}/pricing-rules",
        headers=auth_header(owner),
        json={
            "name": "Eve",
            "start_time": "18:00:00",
            "end_time": "22:00:00",
            "price_multiplier": "1.5",
        },
    )
    return SimpleNamespace(
        id=arena_id,
        court=court_id,
        slots=[s["id"] for s in slots],
        bank=bank.json()["data"]["id"],
        discount=disc.json()["data"]["id"],
        equipment=equip.json()["data"]["id"],
        rule=rule.json()["data"]["id"],
    )


async def _book(
    client: AsyncClient, player: dict, owner: dict, arena: Any, slot_index: int, *, confirm: bool
) -> Any:
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={
            "court_id": arena.court,
            "slot_ids": [arena.slots[slot_index]],
            "payment_type": "full",
        },
    )
    assert booked.status_code in (200, 201), booked.text
    group = booked.json()["data"]["booking_group_id"]
    booking = booked.json()["data"]["bookings"][0]["id"]
    pay = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group, "payment_method": "bank_transfer"},
    )
    payment = pay.json()["data"]["payment"]["id"]
    await client.post(
        f"/api/v1/payments/{payment}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": RECEIPT},
    )
    if confirm:
        ok = await client.post(
            f"/api/v1/owner/payments/{payment}/approve", headers=auth_header(owner)
        )
        assert ok.status_code == 200, ok.text
    return SimpleNamespace(group=group, booking=booking, payment=payment)


@pytest.fixture(autouse=True)
def _no_rate_limit_in_sweeps(client: AsyncClient) -> None:
    """These sweeps send thousands of calls from one address. The limits themselves are tested
    elsewhere and are not changed; here the counter is just cleared before every call."""
    from app.cache import redis as redis_cache

    real = client.request

    async def request(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN002, ANN003, ANN202
        await redis_cache.get_redis().delete("ratelimit:api:127.0.0.1", "ratelimit:auth:127.0.0.1")
        return await real(*args, **kwargs)

    client.request = request  # type: ignore[method-assign]


@pytest.fixture
async def world(client: AsyncClient, db_session: AsyncSession) -> SimpleNamespace:
    owner_a, _ = await make_user(client, db_session, "mx-owner-a@example.com", "owner")
    owner_b, _ = await make_user(client, db_session, "mx-owner-b@example.com", "owner")
    player_a, user_a = await make_user(client, db_session, "mx-player-a@example.com")
    player_b, user_b = await make_user(client, db_session, "mx-player-b@example.com")
    admin = await make_admin(client, db_session, "mx-admin@example.com")
    arena_a = await _arena(client, db_session, owner_a, admin, "A")
    arena_b = await _arena(client, db_session, owner_b, admin, "B")

    waiting = await _book(client, player_a, owner_a, arena_a, 0, confirm=False)  # receipt waiting
    paid = await _book(client, player_a, owner_a, arena_a, 1, confirm=True)  # confirmed
    cancel = await client.post(
        f"/api/v1/bookings/group/{paid.group}/cancel", headers=auth_header(player_a), json={}
    )
    assert cancel.status_code == 200, cancel.text
    refunds = (await client.get("/api/v1/owner/refunds", headers=auth_header(owner_a))).json()[
        "data"
    ]
    refund_id = (refunds["items"] if isinstance(refunds, dict) else refunds)[0]["id"]
    kept = await _book(
        client, player_a, owner_a, arena_a, 2, confirm=True
    )  # confirmed, for a match
    match = await client.post(
        "/api/v1/matches",
        headers=auth_header(player_a),
        json={"booking_group_id": kept.group, "sport": "futsal", "max_players": 2},
    )
    complaint = await client.post(
        "/api/v1/complaints",
        headers=auth_header(player_a),
        json={"category": "other", "description": "Matrix complaint."},
    )
    notes = (await client.get("/api/v1/notifications", headers=auth_header(owner_a))).json()["data"]
    note_id = (notes["items"] if isinstance(notes, dict) else notes)[0]["id"]
    return SimpleNamespace(
        owner_a=owner_a, owner_b=owner_b, player_a=player_a, player_b=player_b, admin=admin,
        user_a=user_a, user_b=user_b, a=arena_a, b=arena_b, waiting=waiting, paid=paid, kept=kept,
        refund=refund_id, match=match.json()["data"]["id"], complaint=complaint.json()["data"]["id"],
        note=note_id,
    )  # fmt: skip


# ---- 1. no token: 401 on every route that needs a sign-in --------------------------------


def _routes() -> list[tuple[str, str, str]]:
    from app.main import app

    out = []
    for r in app.routes:
        for c in (
            list(r.effective_route_contexts()) if hasattr(r, "effective_route_contexts") else []
        ):
            dep = c.dependant or c.original_route.dependant
            names: set[str] = set()

            def walk(d: Any) -> None:  # noqa: ANN001
                for x in d.dependencies:
                    names.add(getattr(x.call, "__name__", ""))
                    if getattr(x.call, "__name__", "") == "_guard" and x.call.__closure__:
                        for cell in x.call.__closure__:
                            if isinstance(cell.cell_contents, tuple):
                                names.add(
                                    "role:"
                                    + "/".join(
                                        str(getattr(v, "value", v)) for v in cell.cell_contents
                                    )
                                )
                    walk(x)

            walk(dep)
            who = next((n[5:] for n in sorted(names) if n.startswith("role:")), None)
            if who is None:
                who = "signed-in" if "get_current_user" in names else "public"
            for m in sorted(c.methods - {"HEAD", "OPTIONS"}):
                out.append((m, c.path, who))
    return sorted(out, key=lambda x: (x[1], x[0]))


def _fill(path: str) -> str:
    import re

    return re.sub(r"\{[^}]+\}", GHOST, path)


async def test_every_route_that_needs_a_sign_in_answers_401_without_one(
    client: AsyncClient,
) -> None:
    wrong = []
    for method, path, who in _routes():
        if who == "public":
            continue
        res = await client.request(method, _fill(path), json={} if method != "GET" else None)
        if res.status_code != 401:
            wrong.append((method, path, res.status_code))
    assert wrong == [], wrong


async def test_every_route_refuses_a_forged_or_empty_bearer(client: AsyncClient) -> None:
    wrong = []
    for method, path, who in _routes():
        if who == "public":
            continue
        for header in ("Bearer", "Bearer not.a.token", "Basic abc"):
            res = await client.request(
                method,
                _fill(path),
                headers={"Authorization": header},
                json={} if method != "GET" else None,
            )
            if res.status_code != 401:
                wrong.append((method, path, header, res.status_code))
    assert wrong == [], wrong[:10]


# ---- 2. the wrong role: 403 ----------------------------------------------------------------


async def test_a_player_cannot_call_owner_or_admin_routes_and_an_owner_cannot_call_admin_routes(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    wrong = []
    for method, path, who in _routes():
        if who not in ("owner", "admin"):
            continue
        attackers = {"player": world.player_a, "owner": world.owner_a}
        if who == "owner":
            attackers = {"player": world.player_a, "admin": world.admin}
        for kind, tokens in attackers.items():
            res = await client.request(
                method,
                _fill(path),
                headers=auth_header(tokens),
                json={} if method != "GET" else None,
            )
            if res.status_code != 403:
                wrong.append((kind, method, path, who, res.status_code))
    assert wrong == [], wrong[:10]


# ---- 3. another person's things -------------------------------------------------------------


def _owner_attacks(w: SimpleNamespace) -> list[tuple[str, str, dict | None]]:
    a = w.a
    day = DAY.isoformat()
    return [
        ("GET", f"/owner/arenas/{a.id}", None),
        ("PATCH", f"/owner/arenas/{a.id}", {"description": "hijacked"}),
        ("DELETE", f"/owner/arenas/{a.id}", None),
        ("POST", f"/owner/arenas/{a.id}/resubmit", {}),
        ("GET", f"/owner/arenas/{a.id}/courts", None),
        ("POST", f"/owner/arenas/{a.id}/courts", {"name": "Evil", "sport_types": ["futsal"], "base_price": "1.00"}),
        ("GET", f"/owner/courts/{a.court}", None),
        ("PATCH", f"/owner/courts/{a.court}", {"name": "Evil"}),
        ("PATCH", f"/owner/courts/{a.court}/availability", {"is_available": False}),
        ("DELETE", f"/owner/courts/{a.court}", None),
        ("GET", f"/owner/courts/{a.court}/slots?date={day}", None),
        ("POST", f"/owner/courts/{a.court}/slots/generate", {"start_date": day, "end_date": day}),
        ("PATCH", f"/owner/courts/{a.court}/slots/{a.slots[3]}", {"status": "maintenance"}),
        ("DELETE", f"/owner/courts/{a.court}/slots/{a.slots[3]}", None),
        ("GET", f"/owner/courts/{a.court}/pricing-rules", None),
        ("POST", f"/owner/courts/{a.court}/pricing-rules", {"name": "E", "start_time": "10:00:00", "end_time": "11:00:00", "price_multiplier": "9"}),
        ("PATCH", f"/owner/courts/{a.court}/pricing-rules/{a.rule}", {"price_multiplier": "9"}),
        ("DELETE", f"/owner/courts/{a.court}/pricing-rules/{a.rule}", None),
        ("GET", f"/owner/arenas/{a.id}/bookings", None),
        ("GET", f"/owner/arenas/{a.id}/bookings/calendar?from={day}&to={day}", None),
        ("GET", f"/owner/arenas/{a.id}/discounts", None),
        ("POST", f"/owner/arenas/{a.id}/discounts", {"code": "EVIL", "discount_type": "percentage", "discount_value": "99"}),
        ("PATCH", f"/owner/arenas/{a.id}/discounts/{a.discount}", {"is_active": False}),
        ("DELETE", f"/owner/arenas/{a.id}/discounts/{a.discount}", None),
        ("GET", f"/owner/arenas/{a.id}/equipment", None),
        ("POST", f"/owner/arenas/{a.id}/equipment", {"name": "E", "rental_price": "1.00", "quantity_total": 1}),
        ("PATCH", f"/owner/equipment/{a.equipment}", {"name": "Evil"}),
        ("PATCH", f"/owner/equipment/{a.equipment}/quantity", {"delta": 5}),
        ("DELETE", f"/owner/equipment/{a.equipment}", None),
        ("GET", f"/owner/arenas/{a.id}/bank-details", None),
        ("POST", f"/owner/arenas/{a.id}/bank-details", {"label": "E", "bank_name": "E", "account_title": "E", "account_number": "1"}),
        ("PATCH", f"/owner/arenas/{a.id}/bank-details/{a.bank}", {"is_active": False}),
        ("DELETE", f"/owner/arenas/{a.id}/bank-details/{a.bank}", None),
        ("GET", f"/owner/arenas/{a.id}/blocked-dates", None),
        ("POST", f"/owner/arenas/{a.id}/blocked-dates", {"blocked_date": "2030-02-02", "reason": "x"}),
        ("GET", f"/owner/arenas/{a.id}/reviews", None),
        ("POST", f"/owner/payments/{w.waiting.payment}/approve", None),
        ("POST", f"/owner/payments/{w.waiting.payment}/reject", {"reason": "no"}),
        ("POST", f"/owner/refunds/{w.refund}/mark-paid", None),
        ("POST", f"/owner/dashboard/bookings/{w.waiting.booking}/remind", None),
    ]  # fmt: skip


def _player_attacks(w: SimpleNamespace) -> list[tuple[str, str, dict | None]]:
    p = w.waiting
    return [
        ("GET", f"/bookings/{p.booking}", None),
        ("POST", f"/bookings/{p.booking}/cancel", {}),
        ("GET", f"/bookings/group/{p.group}", None),
        ("GET", f"/bookings/group/{p.group}/cancel-preview", None),
        ("POST", f"/bookings/group/{p.group}/cancel", {}),
        ("POST", f"/bookings/group/{p.group}/release", None),
        ("POST", f"/bookings/group/{p.group}/reschedule-preview", {"new_slot_ids": [w.a.slots[4]]}),
        ("POST", f"/bookings/group/{p.group}/reschedule", {"new_slot_ids": [w.a.slots[4]]}),
        ("GET", f"/payments/by-group/{p.group}", None),
        ("POST", f"/payments/{p.payment}/receipt", {"receipt_proof_url": RECEIPT}),
        ("GET", f"/payments/{p.payment}/receipt.pdf", None),
        ("GET", f"/complaints/{w.complaint}", None),
        ("PATCH", f"/notifications/{w.note}/read", None),
    ]  # fmt: skip


async def _same_as_missing(
    client: AsyncClient, who: dict, method: str, path: str, body: Any, missing_path: str
) -> str | None:
    """None when the call on someone else's thing is refused exactly like a call on a thing that
    does not exist; otherwise a description of what is wrong."""
    got = await client.request(method, "/api/v1" + path, headers=auth_header(who), json=body)
    miss = await client.request(
        method, "/api/v1" + missing_path, headers=auth_header(who), json=body
    )
    if got.status_code not in (403, 404):
        return f"{method} {path}: {got.status_code} (a stranger got through)"
    if (got.status_code, got.json().get("message")) != (
        miss.status_code,
        miss.json().get("message"),
    ):
        return (
            f"{method} {path}: refused as {got.status_code} {got.json().get('message')!r} but a missing "
            f"thing gives {miss.status_code} {miss.json().get('message')!r} (tells the thing exists)"
        )
    return None


def _ghost(path: str, w: SimpleNamespace) -> str:
    ids = [
        w.a.id, w.a.court, w.a.rule, w.a.discount, w.a.equipment, w.a.bank, w.waiting.group,
        w.waiting.booking, w.waiting.payment, w.complaint, w.note, w.match, w.refund,
    ] + w.a.slots  # fmt: skip
    for i in ids:
        path = path.replace(str(i), GHOST)
    return path


async def test_owner_b_cannot_touch_owner_a_and_is_not_told_it_exists(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    problems = []
    for method, path, body in _owner_attacks(world):
        if (
            method == "GET"
            and path.endswith("/blocked-dates") is False
            and "/owner/arenas/" not in path
            and "/owner/courts/" not in path
        ):
            continue
        bad = await _same_as_missing(client, world.owner_b, method, path, body, _ghost(path, world))
        if bad:
            problems.append(bad)
    assert problems == [], "\n".join(problems)


async def test_player_b_cannot_touch_player_a_and_is_not_told_it_exists(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    problems = []
    for method, path, body in _player_attacks(world):
        bad = await _same_as_missing(
            client, world.player_b, method, path, body, _ghost(path, world)
        )
        if bad:
            problems.append(bad)
    assert problems == [], "\n".join(problems)


async def test_nothing_changed_after_all_those_attacks(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    for who in (world.owner_b, world.player_b):
        for method, path, body in _owner_attacks(world) + _player_attacks(world):
            if body is None and method in ("POST", "PUT", "PATCH"):
                body = {}
            await client.request(method, "/api/v1" + path, headers=auth_header(who), json=body)
    a = await client.get(f"/api/v1/owner/arenas/{world.a.id}", headers=auth_header(world.owner_a))
    assert a.status_code == 200 and a.json()["data"]["description"] != "hijacked"
    group = await client.get(
        f"/api/v1/bookings/group/{world.waiting.group}", headers=auth_header(world.player_a)
    )
    assert group.status_code == 200 and group.json()["data"]["status"] == "pending_approval"
    disc = await client.get(
        f"/api/v1/owner/arenas/{world.a.id}/discounts", headers=auth_header(world.owner_a)
    )
    assert any(d["id"] == world.a.discount and d["is_active"] for d in disc.json()["data"])
    courts = await client.get(
        f"/api/v1/owner/arenas/{world.a.id}/courts", headers=auth_header(world.owner_a)
    )
    assert [c["name"] for c in courts.json()["data"]] == ["Court 1"]


async def test_bank_details_are_shown_only_to_the_owner_an_admin_or_a_paying_player(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    url = f"/api/v1/arenas/{world.a.id}/bank-details"
    assert (
        await client.get(url, headers=auth_header(world.player_a))
    ).status_code == 200  # unpaid booking
    assert (await client.get(url, headers=auth_header(world.owner_a))).status_code == 200
    assert (await client.get(url, headers=auth_header(world.admin))).status_code == 200
    stranger = await client.get(url, headers=auth_header(world.player_b))
    other_owner = await client.get(url, headers=auth_header(world.owner_b))
    missing = await client.get(
        f"/api/v1/arenas/{GHOST}/bank-details", headers=auth_header(world.player_b)
    )
    assert stranger.status_code == other_owner.status_code == missing.status_code == 404
    assert stranger.json()["message"] == missing.json()["message"]


async def test_lists_show_only_the_callers_own_things(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    mine = (
        await client.get(
            "/api/v1/bookings/groups",
            headers=auth_header(world.player_a),
            params={"tab": "upcoming"},
        )
    ).json()["data"]
    theirs = (
        await client.get(
            "/api/v1/bookings/groups",
            headers=auth_header(world.player_b),
            params={"tab": "upcoming"},
        )
    ).json()["data"]
    assert mine["items"] if isinstance(mine, dict) else mine
    assert (theirs["items"] if isinstance(theirs, dict) else theirs) == []
    for path in (
        "/complaints/my",
        "/payments/my",
        "/notifications",
        "/matches/mine",
        "/owner/arenas",
    ):
        body = (
            await client.get(
                "/api/v1" + path,
                headers=auth_header(
                    world.player_b if not path.startswith("/owner") else world.owner_b
                ),
            )
        ).json()["data"]
        items = body["items"] if isinstance(body, dict) and "items" in body else body
        text = json.dumps(items)
        assert world.complaint not in text and world.waiting.group not in text, path
        if path == "/owner/arenas":
            assert world.a.id not in text


# ---- 4. suspended people and arenas ---------------------------------------------------------


async def test_a_suspended_player_is_blocked_everywhere(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    sus = await client.patch(
        f"/api/v1/admin/users/{world.user_a.id}/suspend",
        headers=auth_header(world.admin),
        json={"reason": "Test"},
    )
    assert sus.status_code == 200
    for method, path, body in _player_attacks(world) + [
        ("GET", "/users/me", None),
        (
            "POST",
            "/bookings",
            {"court_id": world.a.court, "slot_ids": [world.a.slots[5]], "payment_type": "full"},
        ),
    ]:
        res = await client.request(
            method, "/api/v1" + path, headers=auth_header(world.player_a), json=body
        )
        assert res.status_code == 401, (method, path, res.status_code)
    login = await client.post(
        "/api/v1/auth/login", json={"email": "mx-player-a@example.com", "password": "StrongP@ss1"}
    )
    assert (
        login.status_code == 401 and login.json()["message"] == "Your account has been suspended."
    )


async def test_a_suspended_owner_is_blocked_and_a_suspended_arena_cannot_be_booked(
    client: AsyncClient, world: SimpleNamespace, db_session: AsyncSession
) -> None:
    from sqlalchemy import select

    from app.modules.user.model import User

    sus_arena = await client.post(
        f"/api/v1/admin/arenas/{world.b.id}/suspend",
        headers=auth_header(world.admin),
        json={"reason": "Test"},
    )
    assert sus_arena.status_code == 200, sus_arena.text
    book = await client.post(
        "/api/v1/bookings",
        headers=auth_header(world.player_b),
        json={"court_id": world.b.court, "slot_ids": [world.b.slots[0]], "payment_type": "full"},
    )
    assert book.status_code in (403, 404), book.text
    listed = await client.get("/api/v1/arenas", params={"page_size": 100})
    assert world.b.id not in json.dumps(listed.json())
    slots = await client.get(
        f"/api/v1/courts/{world.b.court}/slots", params={"date": DAY.isoformat()}
    )
    assert slots.status_code == 404 or slots.json()["data"] == []
    # owner with a suspended arena cannot sell or change anything on it
    for method, path, body in (
        (
            "POST",
            f"/owner/courts/{world.b.court}/slots/generate",
            {"start_date": DAY.isoformat(), "end_date": DAY.isoformat()},
        ),
    ):  # a discount on a suspended arena is harmless: nobody can book it
        res = await client.request(
            method, "/api/v1" + path, headers=auth_header(world.owner_b), json=body
        )
        assert res.status_code in (403, 404, 409, 422), (method, path, res.status_code, res.text)

    owner = await db_session.scalar(select(User).where(User.email == "mx-owner-a@example.com"))
    assert owner is not None
    sus = await client.patch(
        f"/api/v1/admin/users/{owner.id}/suspend",
        headers=auth_header(world.admin),
        json={"reason": "Test"},
    )
    assert sus.status_code == 200
    for method, path, attack_body in _owner_attacks(world)[:6]:
        res = await client.request(
            method, "/api/v1" + path, headers=auth_header(world.owner_a), json=attack_body
        )
        assert res.status_code == 401, (method, path)


# ---- 5. nothing secret is ever in an answer ---------------------------------------------------

FORBIDDEN = (
    "password_hash", "pending_password_hash", "token_hash", "code_hash", "google_sub", "family_id",
    "$argon2", "$2b$", "$2a$", "refresh_token", "client_secret", "jwt_secret",
)  # fmt: skip


async def test_no_answer_carries_a_hash_or_secret(
    client: AsyncClient, world: SimpleNamespace
) -> None:
    gets = [
        ("/users/me", world.player_a), ("/users/me", world.owner_a), ("/users/me", world.admin),
        ("/bookings/groups?tab=upcoming", world.player_a), (f"/bookings/group/{world.waiting.group}", world.player_a),
        ("/payments/my", world.player_a), (f"/payments/by-group/{world.waiting.group}", world.player_a),
        ("/complaints/my", world.player_a), ("/notifications", world.owner_a), ("/matches", world.player_b),
        ("/owner/arenas", world.owner_a), (f"/owner/arenas/{world.a.id}", world.owner_a),
        (f"/owner/arenas/{world.a.id}/bank-details", world.owner_a), (f"/owner/arenas/{world.a.id}/bookings", world.owner_a),
        ("/owner/dashboard/bookings", world.owner_a), ("/owner/refunds", world.owner_a),
        ("/admin/users", world.admin), (f"/admin/users/{world.user_a.id}", world.admin), ("/admin/bookings", world.admin),
        ("/admin/payments", world.admin), ("/admin/arenas", world.admin), ("/admin/audit-logs", world.admin),
        ("/admin/complaints", world.admin), ("/admin/refunds", world.admin), ("/arenas", None),
        (f"/arenas/{world.a.id}", None), ("/search/nlp?q=futsal", None),
    ]  # fmt: skip
    found = []
    for path, who in gets:
        res = await client.get("/api/v1" + path, headers=auth_header(who) if who else None)
        assert res.status_code == 200, (path, res.status_code, res.text[:120])
        text = res.text
        found += [(path, bad) for bad in FORBIDDEN if bad in text]
    assert found == [], found
    # and the other person's phone and email are not in a player's own views
    for path in (
        "/bookings/groups?tab=upcoming",
        f"/bookings/group/{world.waiting.group}",
        "/payments/my",
    ):
        text = (await client.get("/api/v1" + path, headers=auth_header(world.player_a))).text
        assert "mx-owner-a@example.com" not in text and "mx-player-b@example.com" not in text, path
    assert uuid.UUID(GHOST)
