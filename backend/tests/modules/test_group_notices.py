"""A booking of several hours is one event for the player: one notice when it is confirmed, and one
"Receipt not accepted" notice (with the owner's reason) when the receipt is rejected."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification.model import Notification
from tests.helpers import auth_header
from tests.modules.test_group_cancel import _group_with_receipt


async def _events(client: AsyncClient, db: AsyncSession, player: dict) -> list[Notification]:
    me = (await client.get("/api/v1/users/me", headers=auth_header(player))).json()["data"]["id"]
    rows = await db.scalars(select(Notification).where(Notification.user_id == me))
    return list(rows.all())


async def test_a_two_hour_booking_confirmed_is_one_notice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, gid, payment, _, _ = await _group_with_receipt(client, db_session, "gn1", True)
    ok = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/approve", headers=auth_header(owner)
    )
    assert ok.status_code == 200
    events = [n.event for n in await _events(client, db_session, player)]
    assert events.count("booking_confirmed") == 1


async def test_a_rejected_receipt_is_one_notice_that_says_so_with_the_reason(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, gid, payment, _, _ = await _group_with_receipt(client, db_session, "gn2", True)
    no = await client.post(
        f"/api/v1/owner/payments/{payment['id']}/reject",
        headers=auth_header(owner),
        json={"reason": "The amount does not match."},
    )
    assert no.status_code == 200
    notes = await _events(client, db_session, player)
    rejected = [n for n in notes if n.event == "receipt_rejected"]
    assert len(rejected) == 1
    assert [n.event for n in notes].count("booking_payment_failed") == 0
    code = (await client.get(f"/api/v1/bookings/group/{gid}", headers=auth_header(player))).json()[
        "data"
    ]["booking_code"]
    assert rejected[0].title == "Receipt not accepted"
    assert rejected[0].body.endswith(
        f"did not accept your receipt for {code}. Reason: The amount does not match."
    )
