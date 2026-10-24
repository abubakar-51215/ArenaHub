"""Owner single-slot management: block (with a reason), unblock, re-price and delete one slot.
Only the arena's owner may; a held or booked slot is untouchable; every change is audited; asking
twice changes nothing the second time."""

from datetime import date
from decimal import Decimal

from httpx import AsyncClient, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.messages import SLOT_DELETE_ONLY_FREE, SLOT_STATUS_NOT_SETTABLE
from app.modules.admin.model import AuditLog
from app.modules.booking.model import Booking
from app.modules.slot import repository as slot_repo
from app.modules.slot.model import SlotStatus
from tests.helpers import auth_header, make_user
from tests.modules.test_review import _make_bookable_court, _slots


async def _setup(
    client: AsyncClient, db: AsyncSession, tag: str
) -> tuple[dict, str, str, list[dict], str]:
    owner, _ = await make_user(client, db, f"sm-owner-{tag}@example.com", "owner")
    _, court_id, day = await _make_bookable_court(client, db, owner, f"sm-{tag}")
    slots = await _slots(client, court_id, day)
    return auth_header(owner), court_id, day.isoformat(), slots, f"/api/v1/owner/courts/{court_id}"


async def _audits(db: AsyncSession, action: str, slot_id: str) -> list[AuditLog]:
    rows = await db.execute(
        select(AuditLog).where(AuditLog.action == action, AuditLog.target_id == slot_id)
    )
    return list(rows.scalars().all())


async def _book(
    client: AsyncClient, db: AsyncSession, court_id: str, slot_id: str, tag: str
) -> tuple[dict, Response]:
    player, _ = await make_user(client, db, f"sm-player-{tag}@example.com")
    resp = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slot_id], "payment_type": "full"},
    )
    return player, resp


async def _cancel(client: AsyncClient, player: dict, made: Response) -> None:
    group = made.json()["data"]["booking_group_id"]
    done = await client.post(
        f"/api/v1/bookings/group/{group}/cancel", headers=auth_header(player), json={}
    )
    assert done.status_code == 200, done.text


# ---- who may do it -----------------------------------------------------------------------------


async def test_only_the_arena_owner_can_change_a_slot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, _, slots, base = await _setup(client, db_session, "who")
    slot = f"{base}/slots/{slots[0]['id']}"
    other, _ = await make_user(client, db_session, "sm-other-owner@example.com", "owner")
    player, _ = await make_user(client, db_session, "sm-who-player@example.com")
    for who in (auth_header(other), auth_header(player), {}):
        for method, body in (
            ("PATCH", {"status": "maintenance"}),
            ("PATCH", {"price": "1500"}),
            ("DELETE", None),
        ):
            got = await client.request(method, slot, headers=who, json=body)
            assert got.status_code in (401, 403, 404), (method, got.text)
    still = await slot_repo.get_slot(db_session, slots[0]["id"])
    assert still is not None and still.status == SlotStatus.available
    assert still.price == Decimal("2000.00")


# ---- held and booked slots cannot be touched ---------------------------------------------------


async def test_a_held_or_booked_slot_cannot_be_blocked_edited_or_deleted(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, court_id, day, slots, base = await _setup(client, db_session, "locked")
    _, held = await _book(client, db_session, court_id, slots[0]["id"], "locked")
    assert held.status_code in (200, 201), held.text
    row = await slot_repo.get_slot(db_session, slots[0]["id"])
    assert row is not None and row.status == SlotStatus.reserved  # held
    booked = await slot_repo.get_slot(db_session, slots[1]["id"])
    assert booked is not None
    booked.status = SlotStatus.booked
    await db_session.commit()
    for sid in (slots[0]["id"], slots[1]["id"]):
        for body in ({"status": "maintenance"}, {"price": "100"}, {"status": "available"}):
            r = await client.patch(f"{base}/slots/{sid}", headers=h, json=body)
            assert r.status_code == 422, r.text
        assert (await client.delete(f"{base}/slots/{sid}", headers=h)).status_code == 422
    listed = (await client.get(f"{base}/slots", headers=h, params={"date": day})).json()["data"]
    assert [s["status"] for s in listed[:2]] == ["reserved", "booked"]
    assert listed[0]["booking_id"] is not None  # the screen can link to it
    assert listed[2]["booking_id"] is None


async def test_the_owner_cannot_set_a_slot_to_held_or_booked(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, _, _, slots, base = await _setup(client, db_session, "settable")
    for status in ("booked", "reserved"):
        r = await client.patch(f"{base}/slots/{slots[0]['id']}", headers=h, json={"status": status})
        assert r.status_code == 422 and SLOT_STATUS_NOT_SETTABLE in r.text


# ---- block and unblock -----------------------------------------------------------------------


async def test_a_blocked_slot_is_hidden_from_players_cannot_be_booked_and_comes_back(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, court_id, day, slots, base = await _setup(client, db_session, "block")
    sid = slots[3]["id"]
    blocked = await client.patch(
        f"{base}/slots/{sid}", headers=h, json={"status": "maintenance", "reason": "Pitch repair"}
    )
    assert blocked.status_code == 200 and blocked.json()["data"]["status"] == "maintenance"
    public = await _slots(client, court_id, date.fromisoformat(day))
    assert sid not in [s["id"] for s in public] and len(public) == len(slots) - 1
    owner_list = (await client.get(f"{base}/slots", headers=h, params={"date": day})).json()["data"]
    assert [s["status"] for s in owner_list if s["id"] == sid] == [
        "maintenance"
    ]  # owner still sees
    _, try_book = await _book(client, db_session, court_id, sid, "block")
    assert try_book.status_code >= 400
    (audit,) = await _audits(db_session, "slot.block", sid)
    assert audit.details == {"reason": "Pitch repair"} and audit.result == "ok"

    back = await client.patch(f"{base}/slots/{sid}", headers=h, json={"status": "available"})
    assert back.status_code == 200 and back.json()["data"]["status"] == "available"
    public = await _slots(client, court_id, date.fromisoformat(day))
    assert sid in [s["id"] for s in public]
    _, ok_book = await _book(client, db_session, court_id, sid, "block2")
    assert ok_book.status_code in (200, 201), ok_book.text
    assert len(await _audits(db_session, "slot.unblock", sid)) == 1


async def test_blocking_and_unblocking_twice_is_harmless_and_audited_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, _, _, slots, base = await _setup(client, db_session, "twice")
    sid = slots[0]["id"]
    for _ in range(2):
        r = await client.patch(f"{base}/slots/{sid}", headers=h, json={"status": "maintenance"})
        assert r.status_code == 200 and r.json()["data"]["status"] == "maintenance"
    assert len(await _audits(db_session, "slot.block", sid)) == 1
    for _ in range(2):
        r = await client.patch(f"{base}/slots/{sid}", headers=h, json={"status": "available"})
        assert r.status_code == 200 and r.json()["data"]["status"] == "available"
    assert len(await _audits(db_session, "slot.unblock", sid)) == 1


# ---- price -----------------------------------------------------------------------------------


async def test_a_price_change_touches_only_that_slot_and_no_existing_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, court_id, _, slots, base = await _setup(client, db_session, "price")
    player, made = await _book(client, db_session, court_id, slots[0]["id"], "price")
    await _cancel(client, player, made)
    before = list((await db_session.execute(select(Booking.total_amount))).scalars().all())
    r = await client.patch(f"{base}/slots/{slots[0]['id']}", headers=h, json={"price": "1750.50"})
    assert r.status_code == 200 and r.json()["data"]["price"] == "1750.50"
    r = await client.patch(f"{base}/slots/{slots[0]['id']}", headers=h, json={"price": "1750.50"})
    assert r.status_code == 200  # same price again: nothing to do
    for other in slots[1:4]:
        got = await slot_repo.get_slot(db_session, other["id"])
        assert got is not None and got.price == Decimal("2000.00")
    after = list((await db_session.execute(select(Booking.total_amount))).scalars().all())
    assert after == before == [Decimal("2000.00")]
    (audit,) = await _audits(db_session, "slot.update", slots[0]["id"])
    assert audit.details == {"price_from": "2000.00", "price_to": "1750.50"}
    for bad in ("0", "-5", "abc"):
        r = await client.patch(f"{base}/slots/{slots[1]['id']}", headers=h, json={"price": bad})
        assert r.status_code == 422


# ---- delete ----------------------------------------------------------------------------------


async def test_delete_is_only_for_a_free_slot_with_no_booking_history(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, court_id, day, slots, base = await _setup(client, db_session, "del")
    free, with_history, blocked = slots[0]["id"], slots[1]["id"], slots[2]["id"]
    player, made = await _book(client, db_session, court_id, with_history, "del")
    await _cancel(client, player, made)
    await client.patch(f"{base}/slots/{blocked}", headers=h, json={"status": "maintenance"})

    history = await client.delete(f"{base}/slots/{with_history}", headers=h)
    assert history.status_code == 422 and SLOT_DELETE_ONLY_FREE in history.text
    gone_blocked = await client.delete(f"{base}/slots/{blocked}", headers=h)
    assert gone_blocked.status_code == 422 and SLOT_DELETE_ONLY_FREE in gone_blocked.text

    for _ in range(2):  # the second click finds it gone and is still fine
        assert (await client.delete(f"{base}/slots/{free}", headers=h)).status_code == 200
    assert len(await _audits(db_session, "slot.delete", free)) == 1
    listed = (await client.get(f"{base}/slots", headers=h, params={"date": day})).json()["data"]
    assert free not in [s["id"] for s in listed] and len(listed) == len(slots) - 1
    count = await db_session.scalar(select(func.count()).select_from(Booking))
    assert count == 1  # the history is still there


# ---- the older features still work ---------------------------------------------------------


async def test_generating_again_puts_a_deleted_slot_back_without_touching_the_rest(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, _, day, slots, base = await _setup(client, db_session, "regen")
    await client.patch(f"{base}/slots/{slots[1]['id']}", headers=h, json={"price": "999"})
    await client.delete(f"{base}/slots/{slots[0]['id']}", headers=h)
    again = await client.post(
        f"{base}/slots/generate", headers=h, json={"start_date": day, "end_date": day}
    )
    assert again.status_code == 201
    assert again.json()["data"]["created"] == 1
    assert again.json()["data"]["skipped_existing"] == len(slots) - 1
    listed = (await client.get(f"{base}/slots", headers=h, params={"date": day})).json()["data"]
    assert len(listed) == len(slots)
    assert [s["price"] for s in listed if s["id"] == slots[1]["id"]] == ["999.00"]
