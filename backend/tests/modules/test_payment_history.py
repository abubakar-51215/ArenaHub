"""Payment history: each payment carries its booking code and the refunds taken from it."""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_user
from tests.modules.test_match import _arena_and_court, _book


async def test_history_shows_the_booking_code_and_the_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, court_id, day = await _arena_and_court(client, db_session, "ph1")
    player, _ = await make_user(client, db_session, "phplayer1@example.com", "player")
    group_id = await _book(client, player, court_id, day)

    before = (await client.get("/api/v1/payments/my", headers=auth_header(player))).json()["data"]
    item = before["items"][0]
    assert item["booking_code"] == "AHB-" + group_id.replace("-", "")[:6].upper()
    assert item["refunds"] == []

    cancelled = await client.post(
        f"/api/v1/bookings/group/{group_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200
    after = (await client.get("/api/v1/payments/my", headers=auth_header(player))).json()["data"]
    refunds = after["items"][0]["refunds"]
    assert len(refunds) == 1
    assert Decimal(refunds[0]["amount"]) <= Decimal(item["amount"])
    assert refunds[0]["status"] in ("processed", "pending")
    assert refunds[0]["created_at"]
