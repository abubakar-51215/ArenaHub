"""A discount use is reserved by the booking group that applied it at Pay.

- It counts toward the code's limit while the group waits for payment or for the owner's check.
- It becomes permanent when the group is paid and confirmed (and stays counted if that booking
  is cancelled later: the code was used).
- It is given back, once and never below zero, when the group is never paid: the player leaves
  checkout or cancels, the hold expires, or the owner rejects the receipt.
- Bookings without a code are untouched.
"""

import uuid
from datetime import date, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.arena import repository as arena_repo
from app.modules.arena.model import DiscountCode
from app.modules.booking import service as booking_service
from app.modules.booking.model import Booking
from tests.helpers import arena_payload, auth_header, make_admin, make_user
from tests.modules.test_payment import ALL_WEEK_HOURS


async def _setup(client: AsyncClient, db: AsyncSession, tag: str, max_uses: int | None = 2):
    owner, _ = await make_user(client, db, f"dr-o-{tag}@example.com", "owner")
    admin = await make_admin(client, db, f"dr-a-{tag}@example.com")
    arena = await client.post(
        "/api/v1/owner/arenas",
        headers=auth_header(owner),
        json=arena_payload(operating_hours=ALL_WEEK_HOURS, advance_percentage=100),
    )
    arena_id = arena.json()["data"]["id"]
    await client.post(f"/api/v1/admin/arenas/{arena_id}/approve", headers=auth_header(admin))
    court = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/courts",
        headers=auth_header(owner),
        json={"name": "Court A", "sport_types": ["futsal"], "base_price": "2000.00"},
    )
    court_id = court.json()["data"]["id"]
    day = date.today() + timedelta(days=3)
    await client.post(
        f"/api/v1/owner/courts/{court_id}/slots/generate",
        headers=auth_header(owner),
        json={"start_date": day.isoformat(), "end_date": day.isoformat()},
    )
    code = await client.post(
        f"/api/v1/owner/arenas/{arena_id}/discounts",
        headers=auth_header(owner),
        json={
            "code": "SAVE10",
            "discount_type": "percentage",
            "discount_value": "10",
            "max_uses": max_uses,
        },
    )
    assert code.status_code in (200, 201), code.text
    slots = await client.get(f"/api/v1/courts/{court_id}/slots", params={"date": day.isoformat()})
    return owner, arena_id, court_id, [s["id"] for s in slots.json()["data"]]


async def _used(client: AsyncClient, owner: dict, arena_id: str) -> int:
    rows = (
        await client.get(f"/api/v1/owner/arenas/{arena_id}/discounts", headers=auth_header(owner))
    ).json()["data"]
    return next(r for r in rows if r["code"] == "SAVE10")["used_count"]


async def _book(client, player, court_id, slot_ids, code: str | None = "SAVE10"):
    body = {"court_id": court_id, "slot_ids": slot_ids, "payment_type": "full"}
    if code:
        body["discount_code"] = code
    return await client.post("/api/v1/bookings", headers=auth_header(player), json=body)


async def _pay_by_transfer(client, player, gid: str) -> str:
    init = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": gid, "payment_method": "bank_transfer"},
    )
    pid = init.json()["data"]["payment"]["id"]
    sent = await client.post(
        f"/api/v1/payments/{pid}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": "/media/receipts/r.png"},
    )
    assert sent.status_code == 200, sent.text
    return pid


async def test_the_code_is_stored_on_the_booking_and_reserves_a_use(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "store")
    player, _ = await make_user(client, db_session, "dr-p-store@example.com")
    made = await _book(client, player, court_id, slots[:2])
    assert made.status_code in (200, 201), made.text
    assert await _used(client, owner, arena_id) == 1
    rows = (
        await db_session.scalars(
            select(Booking).where(
                Booking.booking_group_id == made.json()["data"]["booking_group_id"]
            )
        )
    ).all()
    # one use per booking group, held on its first booking
    assert [r.discount_code_id is not None for r in sorted(rows, key=lambda r: r.start_time)] == [
        True,
        False,
    ]


async def test_limit_of_one_second_player_is_told_it_is_used_up(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "limit", max_uses=1)
    p1, _ = await make_user(client, db_session, "dr-p-limit1@example.com")
    p2, _ = await make_user(client, db_session, "dr-p-limit2@example.com")
    first = await _book(client, p1, court_id, slots[:1])
    assert first.status_code in (200, 201)
    second = await _book(client, p2, court_id, slots[1:2])
    assert second.status_code in (409, 422)
    assert second.json()["message"] == "This code has been used up."
    preview = await client.post(
        "/api/v1/bookings/preview",
        headers=auth_header(p2),
        json={"court_id": court_id, "slot_ids": slots[1:2], "discount_code": "SAVE10"},
    )
    assert preview.json()["data"]["discount_message"] == "This code has been used up."
    assert await _used(client, owner, arena_id) == 1


async def test_the_atomic_take_never_goes_past_the_limit(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, arena_id, _, _ = await _setup(client, db_session, "atomic", max_uses=1)
    code = await db_session.scalar(
        select(DiscountCode).where(DiscountCode.code == "SAVE10", DiscountCode.arena_id == arena_id)
    )
    assert await arena_repo.try_increment_discount_usage(db_session, code.id) is True
    assert await arena_repo.try_increment_discount_usage(db_session, code.id) is False


async def test_leaving_checkout_gives_the_use_back_once(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "leave")
    player, _ = await make_user(client, db_session, "dr-p-leave@example.com")
    gid = (await _book(client, player, court_id, slots[:2])).json()["data"]["booking_group_id"]
    assert await _used(client, owner, arena_id) == 1
    left = await client.post(f"/api/v1/bookings/group/{gid}/release", headers=auth_header(player))
    assert left.status_code == 200
    assert await _used(client, owner, arena_id) == 0
    # a second release, by the API or the service, gives nothing more back and never goes below 0
    again = await client.post(f"/api/v1/bookings/group/{gid}/release", headers=auth_header(player))
    assert again.status_code == 422
    assert await booking_service.release_discount_use(db_session, uuid.UUID(gid)) is False
    assert await _used(client, owner, arena_id) == 0


async def test_an_expired_hold_gives_the_use_back(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "expire")
    player, _ = await make_user(client, db_session, "dr-p-expire@example.com")
    await _book(client, player, court_id, slots[:1])
    assert await _used(client, owner, arena_id) == 1
    swept = await booking_service.auto_cancel_stale_bookings(
        db_session, now=datetime.now() + timedelta(hours=25)
    )
    assert swept >= 1
    assert await _used(client, owner, arena_id) == 0


async def test_a_rejected_receipt_gives_the_use_back(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "reject")
    player, _ = await make_user(client, db_session, "dr-p-reject@example.com")
    gid = (await _book(client, player, court_id, slots[:1])).json()["data"]["booking_group_id"]
    pid = await _pay_by_transfer(client, player, gid)
    assert await _used(client, owner, arena_id) == 1  # still held while the owner checks
    no = await client.post(
        f"/api/v1/owner/payments/{pid}/reject",
        headers=auth_header(owner),
        json={"reason": "The amount does not match."},
    )
    assert no.status_code == 200
    assert await _used(client, owner, arena_id) == 0


async def test_cancelling_before_confirmation_gives_the_use_back(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "cancel")
    player, _ = await make_user(client, db_session, "dr-p-cancel@example.com")
    gid = (await _book(client, player, court_id, slots[:2])).json()["data"]["booking_group_id"]
    await _pay_by_transfer(client, player, gid)  # receipt sent, not checked yet
    gone = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert gone.status_code == 200, gone.text
    assert await _used(client, owner, arena_id) == 0


async def test_a_confirmed_booking_keeps_its_use_even_when_cancelled_later(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "keep")
    player, _ = await make_user(client, db_session, "dr-p-keep@example.com")
    gid = (await _book(client, player, court_id, slots[:1])).json()["data"]["booking_group_id"]
    pid = await _pay_by_transfer(client, player, gid)
    ok = await client.post(f"/api/v1/owner/payments/{pid}/approve", headers=auth_header(owner))
    assert ok.status_code == 200
    assert await _used(client, owner, arena_id) == 1
    gone = await client.post(
        f"/api/v1/bookings/group/{gid}/cancel", headers=auth_header(player), json={}
    )
    assert gone.status_code == 200, gone.text
    assert await _used(client, owner, arena_id) == 1


async def test_a_booking_without_a_code_is_untouched(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, arena_id, court_id, slots = await _setup(client, db_session, "none")
    player, _ = await make_user(client, db_session, "dr-p-none@example.com")
    gid = (await _book(client, player, court_id, slots[:1], code=None)).json()["data"][
        "booking_group_id"
    ]
    await client.post(f"/api/v1/bookings/group/{gid}/release", headers=auth_header(player))
    assert await _used(client, owner, arena_id) == 0
    row = await db_session.scalar(select(Booking).where(Booking.booking_group_id == gid))
    assert row.discount_code_id is None and row.discount_released_at is None
