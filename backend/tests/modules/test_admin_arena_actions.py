"""Admin arena moderation: suspend, reactivate and remove (soft delete).

Covers the routes' state rules (409 / 422 / 403 / 401), the effects on
bookings (future ones cancelled with a full refund, past ones untouched),
gateway refund failure and the scheduled retry, notices, audit entries,
and that a suspended or removed arena disappears for players."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.payments.base import RefundResult
from app.modules.admin.model import AuditLog
from app.modules.arena.model import Arena
from app.modules.booking.model import Booking, BookingStatus
from app.modules.notification.model import Notification
from app.modules.payment import service as payment_service
from app.modules.payment.model import Refund, RefundStatus
from tests.helpers import arena_payload, auth_header, make_admin, make_user

REASON = "Repeated safety complaints from players."
API = "/api/v1"


def _next_monday() -> date:
    today = date.today()
    monday = today + timedelta(days=(7 - today.weekday()) % 7 or 7)
    # at least 3 days away, so the cancellation window never depends on the time of day
    return monday if (monday - today).days >= 3 else monday + timedelta(days=7)


async def _fresh(db: AsyncSession, stmt: Any) -> Any:
    """Run ``stmt`` reloading the rows it returns, so changes the API made are seen."""
    result = await db.execute(stmt.execution_options(populate_existing=True))
    return result.scalars().all()


async def _setup(client: AsyncClient, db: AsyncSession, tag: str) -> dict:
    """An approved arena with one court and Monday's slots, plus its owner and an admin."""
    owner, owner_user = await make_user(client, db, f"{tag}-owner@example.com", "owner")
    admin = await make_admin(client, db, f"{tag}-admin@example.com")
    arena = await client.post(
        f"{API}/owner/arenas", headers=auth_header(owner), json=arena_payload(name=f"{tag} Arena")
    )
    arena_id = arena.json()["data"]["id"]
    await client.post(f"{API}/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"{API}/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    monday = _next_monday()
    await client.post(
        f"{API}/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": monday.isoformat(), "end_date": monday.isoformat()},
    )
    return {
        "owner": owner,
        "owner_id": owner_user.id,
        "admin": admin,
        "arena_id": arena_id,
        "court_id": court_id,
        "day": monday,
    }


async def _slot_ids(client: AsyncClient, court_id: str, day: date) -> list[str]:
    resp = await client.get(f"{API}/courts/{court_id}/slots", params={"date": day.isoformat()})
    return [s["id"] for s in resp.json()["data"]]


async def _paid_booking(client: AsyncClient, player: dict, court_id: str, slot_id: str) -> str:
    """Book one slot and pay in full (JazzCash, confirmed through simulate-confirm).
    Returns the booking group id."""
    booked = await client.post(
        f"{API}/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slot_id], "payment_type": "full"},
    )
    group_id = booked.json()["data"]["booking_group_id"]
    started = await client.post(
        f"{API}/payments/initiate",
        headers=auth_header(player),
        json={
            "booking_group_id": group_id,
            "payment_method": "jazzcash",
            "wallet_number": "03001234567",
        },
    )
    payment_id = started.json()["data"]["payment"]["id"]
    done = await client.post(
        f"{API}/payments/{payment_id}/simulate-confirm",
        headers=auth_header(player),
        params={"success": True},
    )
    assert done.json()["data"]["status"] == "completed"
    return group_id


async def _act(
    client: AsyncClient, admin: dict, arena_id: str, action: str, reason: Any = REASON
) -> Any:
    """POST suspend / reactivate, or DELETE for remove; ``reason=None`` sends no body field."""
    body = {} if reason is None else {"reason": reason}
    if action == "delete":
        return await client.request(
            "DELETE", f"{API}/admin/arenas/{arena_id}", headers=auth_header(admin), json=body
        )
    return await client.post(
        f"{API}/admin/arenas/{arena_id}/{action}", headers=auth_header(admin), json=body
    )


# ---- state rules ----------------------------------------------------------


async def test_suspend_then_reactivate_and_repeats_conflict(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod1")

    first = await _act(client, s["admin"], s["arena_id"], "suspend")
    assert first.status_code == 200
    data = first.json()["data"]
    assert data["suspended_at"] is not None
    assert data["suspended_reason"] == REASON

    again = await _act(client, s["admin"], s["arena_id"], "suspend")
    assert again.status_code == 409

    lifted = await _act(client, s["admin"], s["arena_id"], "reactivate")
    assert lifted.status_code == 200
    assert lifted.json()["data"]["suspended_at"] is None

    # reactivating an arena that is not suspended is the wrong state
    twice = await _act(client, s["admin"], s["arena_id"], "reactivate")
    assert twice.status_code == 409


async def test_suspend_needs_an_approved_arena(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "mod2-owner@example.com", "owner")
    admin = await make_admin(client, db_session, "mod2-admin@example.com")
    pending = await client.post(
        f"{API}/owner/arenas", headers=auth_header(owner), json=arena_payload()
    )
    arena_id = pending.json()["data"]["id"]

    resp = await _act(client, admin, arena_id, "suspend")
    assert resp.status_code == 409


async def test_delete_once_then_every_action_conflicts(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod3")

    removed = await _act(client, s["admin"], s["arena_id"], "delete")
    assert removed.status_code == 200
    assert removed.json()["data"]["deleted_reason"] == REASON

    for action in ("delete", "suspend", "reactivate"):
        resp = await _act(client, s["admin"], s["arena_id"], action)
        assert resp.status_code == 409, action

    # a removed arena is not listed for admins either
    listed = await client.get(
        f"{API}/admin/arenas", headers=auth_header(s["admin"]), params={"status": "approved"}
    )
    assert s["arena_id"] not in [a["id"] for a in listed.json()["data"]["items"]]


async def test_suspended_filter_on_admin_list(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod4")
    await _act(client, s["admin"], s["arena_id"], "suspend")
    h = auth_header(s["admin"])

    async def ids(**params: Any) -> list[str]:
        resp = await client.get(
            f"{API}/admin/arenas", headers=h, params={"status": "approved", **params}
        )
        return [a["id"] for a in resp.json()["data"]["items"]]

    assert s["arena_id"] in await ids(suspended="true")
    assert s["arena_id"] not in await ids(suspended="false")
    assert s["arena_id"] in await ids()


@pytest.mark.parametrize("reason", [None, "", "         "])
async def test_suspend_and_delete_need_a_reason(
    client: AsyncClient, db_session: AsyncSession, reason: Any
) -> None:
    s = await _setup(client, db_session, f"mod5{len(reason or '')}")
    for action in ("suspend", "delete"):
        resp = await _act(client, s["admin"], s["arena_id"], action, reason=reason)
        assert resp.status_code == 422, (action, reason)


async def test_a_one_character_reason_is_enough_and_reactivate_needs_none(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod5b")
    suspended = await _act(client, s["admin"], s["arena_id"], "suspend", reason="x")
    assert suspended.status_code == 200
    lifted = await client.post(
        f"{API}/admin/arenas/{s['arena_id']}/reactivate", headers=auth_header(s["admin"])
    )
    assert lifted.status_code == 200


async def test_reason_longer_than_500_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod6")
    resp = await _act(client, s["admin"], s["arena_id"], "suspend", reason="x" * 501)
    assert resp.status_code == 422


async def test_non_admin_gets_403_and_no_login_gets_401(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "mod7")
    player, _ = await make_user(client, db_session, "mod7-player@example.com", "player")

    for who in (s["owner"], player):
        for action in ("suspend", "reactivate", "delete"):
            resp = await _act(client, who, s["arena_id"], action)
            assert resp.status_code == 403, action

    anon = await client.post(f"{API}/admin/arenas/{s['arena_id']}/suspend", json={"reason": REASON})
    assert anon.status_code == 401
    anon_delete = await client.request(
        "DELETE", f"{API}/admin/arenas/{s['arena_id']}", json={"reason": REASON}
    )
    assert anon_delete.status_code == 401


# ---- effects on bookings, refunds, notices and audit -----------------------


async def _bookings(db: AsyncSession, arena_id: str) -> list[Booking]:
    return await _fresh(db, select(Booking).where(Booking.arena_id == arena_id))


async def _refunds(db: AsyncSession, booking_id: Any) -> list[Refund]:
    return await _fresh(db, select(Refund).where(Refund.booking_id == booking_id))


async def _events(db: AsyncSession, user_id: Any) -> list[Notification]:
    return await _fresh(db, select(Notification).where(Notification.user_id == user_id))


async def _audit(db: AsyncSession, action: str, arena_id: str) -> list[AuditLog]:
    return await _fresh(
        db, select(AuditLog).where(AuditLog.action == action, AuditLog.target_id == arena_id)
    )


async def _make_past(db: AsyncSession, group_id: str) -> None:
    """Move a booking to yesterday, as if it had already been played."""
    rows = await _fresh(db, select(Booking).where(Booking.booking_group_id == group_id))
    for b in rows:
        b.booking_date = date.today() - timedelta(days=1)
    await db.commit()


async def test_suspend_cancels_only_future_bookings_with_full_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "eff1")
    player, player_user = await make_user(client, db_session, "eff1-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])

    future_group = await _paid_booking(client, player, s["court_id"], slots[0])
    past_group = await _paid_booking(client, player, s["court_id"], slots[1])
    await _make_past(db_session, past_group)
    # booked but never paid: cancelled too, with nothing to refund
    unpaid = await client.post(
        f"{API}/bookings",
        headers=auth_header(player),
        json={"court_id": s["court_id"], "slot_ids": [slots[2]], "payment_type": "full"},
    )
    unpaid_group = unpaid.json()["data"]["booking_group_id"]

    resp = await _act(client, s["admin"], s["arena_id"], "suspend")
    assert resp.status_code == 200

    by_group = {str(b.booking_group_id): b for b in await _bookings(db_session, s["arena_id"])}
    future, past, never_paid = by_group[future_group], by_group[past_group], by_group[unpaid_group]
    assert future.status == BookingStatus.cancelled
    assert future.refund_percentage == 100
    assert past.status == BookingStatus.confirmed
    assert never_paid.status == BookingStatus.cancelled

    [refund] = await _refunds(db_session, future.id)
    assert refund.status == RefundStatus.processed
    assert refund.amount == future.total_amount
    assert await _refunds(db_session, past.id) == []
    assert await _refunds(db_session, never_paid.id) == []

    owner_events = await _events(db_session, s["owner_id"])
    suspended = [n for n in owner_events if n.event == "arena_suspended"]
    assert len(suspended) == 1 and REASON in suspended[0].body
    player_events = [n.event for n in await _events(db_session, player_user.id)]
    assert player_events.count("booking_cancelled") == 2
    assert "refund_initiated" in player_events

    [entry] = await _audit(db_session, "arena.suspend", s["arena_id"])
    assert entry.details == {"reason": REASON, "bookings_cancelled": 2, "refunds_pending": 0}


async def test_delete_cancels_future_bookings_and_tells_the_owner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "eff2")
    player, _ = await make_user(client, db_session, "eff2-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    group = await _paid_booking(client, player, s["court_id"], slots[0])

    resp = await _act(client, s["admin"], s["arena_id"], "delete")
    assert resp.status_code == 200

    [booking] = await _bookings(db_session, s["arena_id"])
    assert str(booking.booking_group_id) == group
    assert booking.status == BookingStatus.cancelled
    [refund] = await _refunds(db_session, booking.id)
    assert refund.status == RefundStatus.processed

    events = [n for n in await _events(db_session, s["owner_id"]) if n.event == "arena_deleted"]
    assert len(events) == 1 and REASON in events[0].body
    [entry] = await _audit(db_session, "arena.delete", s["arena_id"])
    assert entry.details == {"reason": REASON, "bookings_cancelled": 1, "refunds_pending": 0}


async def test_reactivate_tells_the_owner_and_writes_audit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "eff3")
    await _act(client, s["admin"], s["arena_id"], "suspend")
    resp = await _act(client, s["admin"], s["arena_id"], "reactivate")
    assert resp.status_code == 200

    events = [n.event for n in await _events(db_session, s["owner_id"])]
    assert "arena_reactivated" in events
    [entry] = await _audit(db_session, "arena.reactivate", s["arena_id"])
    assert entry.details["reason"] == REASON


# ---- gateway failure and the retry job ------------------------------------


class _Gateway:
    """Stands in for the payment gateway: fails ``failures`` times, then
    succeeds; remembers the idempotency key of every call."""

    def __init__(self, failures: int, answer: str = "processed") -> None:
        self.failures = failures
        self.answer = answer
        self.keys: list[str | None] = []

    async def refund(
        self, *, gateway_transaction_id: str, amount: Decimal, idempotency_key: Any = None
    ) -> Any:
        self.keys.append(idempotency_key)
        if self.failures > 0:
            self.failures -= 1
            raise ConnectionError("gateway unreachable")
        return RefundResult(provider_reference="re_test", status=self.answer)


async def _suspend_with_gateway(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    tag: str,
    failures: int,
    answer: Any = "processed",
) -> Any:
    """A paid future booking, then a suspend while the gateway is failing."""
    s = await _setup(client, db, tag)
    player, player_user = await make_user(client, db, f"{tag}-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    await _paid_booking(client, player, s["court_id"], slots[0])

    gateway = _Gateway(failures, answer)
    monkeypatch.setattr(payment_service, "get_provider", lambda _method: gateway)
    resp = await _act(client, s["admin"], s["arena_id"], "suspend")
    assert resp.status_code == 200
    [booking] = await _bookings(db, s["arena_id"])
    [refund] = await _refunds(db, booking.id)
    return s, player_user, booking, refund, gateway


async def test_gateway_failure_keeps_refund_pending_and_suspend_succeeds(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = datetime.now()
    s, _, booking, refund, gateway = await _suspend_with_gateway(
        client, db_session, monkeypatch, "gw1", failures=1
    )
    assert booking.status == BookingStatus.cancelled
    assert refund.status == RefundStatus.pending
    assert refund.gateway_attempts == 1
    assert refund.last_error and "gateway unreachable" in refund.last_error
    assert refund.next_attempt_at is not None
    assert refund.next_attempt_at - before >= timedelta(minutes=5)
    assert refund.needs_manual is False
    assert gateway.keys == [str(refund.id)]

    [entry] = await _audit(db_session, "arena.suspend", s["arena_id"])
    assert entry.details["refunds_pending"] == 1

    # the admin booking list shows the refund as waiting
    h = auth_header(s["admin"])
    rows = (await client.get(f"{API}/admin/bookings", headers=h)).json()["data"]["items"]
    assert [r["refund_pending"] for r in rows if r["id"] == str(booking.id)] == [True]
    # with the AHB-xxxxxx reference the player and the owner see
    code = "AHB-" + booking.booking_group_id.hex[:6].upper()
    assert [r["booking_code"] for r in rows if r["id"] == str(booking.id)] == [code]


async def test_retry_job_completes_refund_on_a_later_try(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player_user, booking, refund, gateway = await _suspend_with_gateway(
        client, db_session, monkeypatch, "gw2", failures=1
    )
    due = refund.next_attempt_at

    # not due yet: nothing is tried
    early = due - timedelta(seconds=1)
    assert await payment_service.retry_pending_refunds(db_session, now=early) == 0

    assert await payment_service.retry_pending_refunds(db_session, now=due) == 1
    [done] = await _refunds(db_session, booking.id)
    assert done.id == refund.id
    assert done.status == RefundStatus.processed
    assert done.gateway_attempts == 2
    assert done.next_attempt_at is None
    assert gateway.keys == [str(refund.id), str(refund.id)]

    events = [n.event for n in await _events(db_session, player_user.id)]
    assert events.count("refund_completed") == 1


async def test_retry_job_running_again_does_not_refund_twice(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player_user, booking, refund, gateway = await _suspend_with_gateway(
        client, db_session, monkeypatch, "gw3", failures=1
    )
    due = refund.next_attempt_at
    assert await payment_service.retry_pending_refunds(db_session, now=due) == 1
    # a second (or overlapping) run finds nothing left to do
    later = due + timedelta(hours=1)
    assert await payment_service.retry_pending_refunds(db_session, now=later) == 0

    assert len(await _refunds(db_session, booking.id)) == 1
    assert len(gateway.keys) == 2
    assert set(gateway.keys) == {str(refund.id)}
    events = [n.event for n in await _events(db_session, player_user.id)]
    assert events.count("refund_completed") == 1


async def test_retry_job_hands_over_to_manual_after_six_tries(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, player_user, booking, refund, gateway = await _suspend_with_gateway(
        client, db_session, monkeypatch, "gw4", failures=100
    )
    delays = []
    for _ in range(5):
        now = refund.next_attempt_at
        assert await payment_service.retry_pending_refunds(db_session, now=now) == 1
        [refund] = await _refunds(db_session, booking.id)
        if refund.next_attempt_at is not None:
            delays.append(refund.next_attempt_at - now)

    # waits of 10, 20, 40 and 80 minutes between the later tries
    assert delays == [timedelta(minutes=m) for m in (10, 20, 40, 80)]
    assert refund.gateway_attempts == 6
    assert refund.needs_manual is True
    assert refund.next_attempt_at is None
    assert refund.status == RefundStatus.pending
    assert len(gateway.keys) == 6

    # nothing more is tried automatically
    later = datetime.now() + timedelta(days=1)
    assert await payment_service.retry_pending_refunds(db_session, now=later) == 0

    events = [n.event for n in await _events(db_session, player_user.id)]
    assert events.count("refund_needs_manual") == 1
    assert "refund_completed" not in events


# ---- what players and the owner see ---------------------------------------


async def _player_view(client: AsyncClient, player: dict, arena_id: str) -> dict[str, bool]:
    """Where the arena shows up for a player: search, trending, recommendations, liked."""
    h = auth_header(player)

    async def ids(path: str) -> list[str]:
        resp = await client.get(f"{API}{path}", headers=h)
        return [a["id"] for a in resp.json()["data"]["items"]]

    return {
        "search": arena_id in await ids("/arenas"),
        "trending": arena_id in await ids("/arenas/trending"),
        "recommended": arena_id in await ids("/recommendations"),
        "liked": arena_id in await ids("/arenas/liked"),
    }


async def _set_admin_flag(db: AsyncSession, arena_id: str, column: str) -> None:
    """Mark the arena suspended or removed directly, leaving its bookings as
    they are, so the lists are tested on the flag alone (the API would also
    cancel the bookings, which drops the arena from trending by itself)."""
    [arena] = await _fresh(db, select(Arena).where(Arena.id == arena_id))
    setattr(arena, column, datetime.now())
    await db.commit()


@pytest.mark.parametrize("column", ["suspended_at", "deleted_at"])
async def test_suspended_or_removed_arena_is_hidden_from_player_lists(
    client: AsyncClient, db_session: AsyncSession, column: str
) -> None:
    s = await _setup(client, db_session, f"vis-{column[:3]}")
    player, _ = await make_user(client, db_session, f"vis-{column[:3]}-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    await _paid_booking(client, player, s["court_id"], slots[0])
    await client.post(f"{API}/arenas/{s['arena_id']}/like", headers=auth_header(player))

    everywhere = {"search": True, "trending": True, "recommended": True, "liked": True}
    assert await _player_view(client, player, s["arena_id"]) == everywhere

    await _set_admin_flag(db_session, s["arena_id"], column)

    nowhere = {"search": False, "trending": False, "recommended": False, "liked": False}
    assert await _player_view(client, player, s["arena_id"]) == nowhere
    page = await client.get(f"{API}/arenas/{s['arena_id']}")
    assert page.status_code == 404


async def test_reactivated_arena_comes_back_for_players(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "vis2")
    player, _ = await make_user(client, db_session, "vis2-player@example.com")
    await client.post(f"{API}/arenas/{s['arena_id']}/like", headers=auth_header(player))

    await _act(client, s["admin"], s["arena_id"], "suspend")
    view = await _player_view(client, player, s["arena_id"])
    assert (view["search"], view["liked"]) == (False, False)

    await _act(client, s["admin"], s["arena_id"], "reactivate")
    view = await _player_view(client, player, s["arena_id"])
    assert (view["search"], view["liked"]) == (True, True)
    assert (await client.get(f"{API}/arenas/{s['arena_id']}")).status_code == 200


async def test_suspended_arena_refuses_bookings_and_hides_freed_slots(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "vis3")
    player, _ = await make_user(client, db_session, "vis3-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    await _paid_booking(client, player, s["court_id"], slots[0])

    await _act(client, s["admin"], s["arena_id"], "suspend")

    # the cancelled booking freed slots[0], but the slots are not offered
    listed = await client.get(
        f"{API}/courts/{s['court_id']}/slots", params={"date": s["day"].isoformat()}
    )
    assert listed.status_code == 404

    for slot_id in (slots[0], slots[1]):
        booked = await client.post(
            f"{API}/bookings",
            headers=auth_header(player),
            json={"court_id": s["court_id"], "slot_ids": [slot_id], "payment_type": "full"},
        )
        assert booked.status_code == 404

    # nor can the owner put new slots on sale
    later = s["day"] + timedelta(days=7)
    generated = await client.post(
        f"{API}/owner/courts/{s['court_id']}/slots/generate",
        headers=auth_header(s["owner"]),
        json={"start_date": later.isoformat(), "end_date": later.isoformat()},
    )
    assert generated.status_code == 422


async def test_owner_cannot_lift_a_suspension(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "own1")
    h = auth_header(s["owner"])
    await _act(client, s["admin"], s["arena_id"], "suspend")

    # a body that tries to set is_active or suspended_at is refused outright (unknown fields),
    # and a plain edit leaves it suspended
    sneaky = await client.patch(
        f"{API}/owner/arenas/{s['arena_id']}",
        headers=h,
        json={"name": "Renamed Arena", "is_active": True, "suspended_at": None},
    )
    assert sneaky.status_code == 422
    edited = await client.patch(
        f"{API}/owner/arenas/{s['arena_id']}", headers=h, json={"name": "Renamed Arena"}
    )
    assert edited.status_code == 200
    await client.delete(f"{API}/owner/arenas/{s['arena_id']}", headers=h)

    mine = await client.get(f"{API}/owner/arenas/{s['arena_id']}", headers=h)
    data = mine.json()["data"]
    assert data["suspended_at"] is not None
    assert data["suspended_reason"] == REASON
    assert (await client.get(f"{API}/arenas/{s['arena_id']}")).status_code == 404


async def test_removed_arena_is_read_only_for_its_owner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    s = await _setup(client, db_session, "own2")
    h = auth_header(s["owner"])
    await _act(client, s["admin"], s["arena_id"], "delete")

    edited = await client.patch(
        f"{API}/owner/arenas/{s['arena_id']}", headers=h, json={"name": "Renamed Arena"}
    )
    assert edited.status_code == 422

    mine = await client.get(f"{API}/owner/arenas/{s['arena_id']}", headers=h)
    assert mine.json()["data"]["deleted_reason"] == REASON


async def test_gateway_answering_pending_counts_as_a_try_until_manual(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A gateway that never raises but keeps answering "pending" must not leave
    the refund pending forever: each answer is a try, and the sixth hands over."""
    _, player_user, booking, refund, gateway = await _suspend_with_gateway(
        client, db_session, monkeypatch, "gw5", failures=0, answer="pending"
    )
    # the first try (inside the suspend) already counts and schedules a retry
    assert refund.gateway_attempts == 1
    assert refund.next_attempt_at is not None
    assert "pending" in refund.last_error

    for _ in range(5):
        assert (
            await payment_service.retry_pending_refunds(db_session, now=refund.next_attempt_at) == 1
        )
        [refund] = await _refunds(db_session, booking.id)

    assert refund.gateway_attempts == 6
    assert refund.needs_manual is True
    assert refund.next_attempt_at is None
    assert refund.status == RefundStatus.pending
    assert set(gateway.keys) == {str(refund.id)} and len(gateway.keys) == 6
    events = [n.event for n in await _events(db_session, player_user.id)]
    assert events.count("refund_needs_manual") == 1


async def test_admin_payments_show_lifecycle_status(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A fully refunded payment's coarse status becomes "refunded" too, not stuck at
    "completed" as if money were still owed; its lifecycle is "refunded" either way."""
    s = await _setup(client, db_session, "life1")
    player, _ = await make_user(client, db_session, "life1-player@example.com")
    slots = await _slot_ids(client, s["court_id"], s["day"])
    await _paid_booking(client, player, s["court_id"], slots[0])

    h = auth_header(s["admin"])
    before = (await client.get(f"{API}/admin/payments", headers=h)).json()["data"]["items"]
    [paid] = before
    assert paid["lifecycle_status"] == "confirmed"

    await _act(client, s["admin"], s["arena_id"], "suspend")
    after = (await client.get(f"{API}/admin/payments", headers=h)).json()["data"]["items"]
    [refunded] = after
    assert refunded["status"] == "refunded"
    assert refunded["lifecycle_status"] == "refunded"
