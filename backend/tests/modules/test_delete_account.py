"""Delete account: an emailed code is always required; refused while the player has an
upcoming or unpaid booking, allowed otherwise."""

from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.email.smtp import EmailSendError
from app.modules.auth import repository as repo
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import auth_header, last_code, make_user
from tests.modules.test_match import _arena_and_court, _book

REQUEST = "/api/v1/users/me/delete"
VERIFY = "/api/v1/users/me/delete/verify"


async def _request_code(client: AsyncClient, player: dict) -> None:
    resp = await client.post(REQUEST, headers=auth_header(player))
    assert resp.status_code == 200


async def test_delete_is_refused_with_an_upcoming_confirmed_booking(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, court_id, day = await _arena_and_court(client, db_session, "d1")
    player, user = await make_user(client, db_session, "dplayer1@example.com", "player")
    group_id = await _book(client, player, court_id, day)
    await _request_code(client, player)
    code = last_code(user.id, OtpPurpose.account_deletion)
    refused = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert refused.status_code == 409
    assert "upcoming or unpaid bookings" in refused.json()["message"]
    # still signed in and active
    assert (await client.get("/api/v1/users/me", headers=auth_header(player))).status_code == 200
    # after cancelling the booking, a fresh code completes the deletion
    cancelled = await client.post(
        f"/api/v1/bookings/group/{group_id}/cancel", headers=auth_header(player), json={}
    )
    assert cancelled.status_code == 200
    await _request_code(client, player)
    new_code = last_code(user.id, OtpPurpose.account_deletion)
    done = await client.post(VERIFY, headers=auth_header(player), json={"code": new_code})
    assert done.status_code == 200


async def test_delete_is_refused_with_an_unpaid_booking_and_with_one_awaiting_approval(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, court_id, day = await _arena_and_court(client, db_session, "d2")
    player, user = await make_user(client, db_session, "dplayer2@example.com", "player")
    await _book(client, player, court_id, day, pay=False)
    await _request_code(client, player)
    code = last_code(user.id, OtpPurpose.account_deletion)
    refused = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert refused.status_code == 409


async def test_delete_is_allowed_with_no_bookings(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user = await make_user(client, db_session, "dplayer3@example.com", "player")
    await _request_code(client, player)
    code = last_code(user.id, OtpPurpose.account_deletion)
    assert (
        await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    ).status_code == 200
    # the session no longer works
    assert (await client.get("/api/v1/users/me", headers=auth_header(player))).status_code == 401


async def test_delete_without_a_code_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "dplayer4@example.com", "player")
    resp = await client.post(VERIFY, headers=auth_header(player), json={"code": "123456"})
    assert resp.status_code == 422


async def test_delete_with_wrong_code_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user = await make_user(client, db_session, "dplayer5@example.com", "player")
    await _request_code(client, player)
    real = last_code(user.id, OtpPurpose.account_deletion)
    wrong = "000000" if real != "000000" else "111111"
    resp = await client.post(VERIFY, headers=auth_header(player), json={"code": wrong})
    assert resp.status_code == 422
    # the right code still works afterwards (one wrong try does not lock it)
    assert (await client.get("/api/v1/users/me", headers=auth_header(player))).status_code == 200
    ok = await client.post(VERIFY, headers=auth_header(player), json={"code": real})
    assert ok.status_code == 200


async def test_delete_another_users_code_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player_a, user_a = await make_user(client, db_session, "dplayer6a@example.com", "player")
    player_b, _ = await make_user(client, db_session, "dplayer6b@example.com", "player")
    await _request_code(client, player_a)
    await _request_code(client, player_b)
    code_a = last_code(user_a.id, OtpPurpose.account_deletion)
    resp = await client.post(VERIFY, headers=auth_header(player_b), json={"code": code_a})
    assert resp.status_code == 422


async def test_delete_expired_code_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user = await make_user(client, db_session, "dplayer7@example.com", "player")
    await _request_code(client, player)
    code = last_code(user.id, OtpPurpose.account_deletion)
    row = await repo.get_latest_otp(db_session, user.id, OtpPurpose.account_deletion)
    assert row is not None
    row.expires_at -= timedelta(minutes=11)
    await db_session.commit()
    resp = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert resp.status_code == 422
    assert resp.json()["message"] == codes.WRONG_CODE_MESSAGE


async def test_delete_code_cannot_be_used_twice(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user = await make_user(client, db_session, "dplayer8@example.com", "player")
    await _request_code(client, player)
    code = last_code(user.id, OtpPurpose.account_deletion)
    first = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert first.status_code == 200
    second = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert second.status_code == 401  # the session from the first (successful) delete is dead


async def test_delete_five_wrong_tries_locks_the_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user = await make_user(client, db_session, "dplayer9@example.com", "player")
    await _request_code(client, player)
    real = last_code(user.id, OtpPurpose.account_deletion)
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(4):
        await client.post(VERIFY, headers=auth_header(player), json={"code": wrong})
    fifth = await client.post(VERIFY, headers=auth_header(player), json={"code": wrong})
    assert fifth.json()["message"] == "Too many wrong tries. Ask for a new code."
    locked = await client.post(VERIFY, headers=auth_header(player), json={"code": real})
    assert locked.json()["message"] == "Too many wrong tries. Ask for a new code."


async def test_delete_a_failed_send_is_reported_and_resend_works(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mirrors test_bank_details_otp.py: the sender is swapped out, so no real address —
    reserved or otherwise — is ever actually contacted."""
    player, user = await make_user(client, db_session, "dplayer10@example.com", "player")

    async def broken(*args: Any, **kwargs: Any) -> None:
        raise EmailSendError("cannot connect or timed out", "Check EMAIL_HOST.", temporary=True)

    monkeypatch.setattr(codes, "send_email", broken)
    req = await client.post(REQUEST, headers=auth_header(player))
    assert req.status_code == 503
    assert req.json()["message"] == codes.NOT_SENT_MESSAGE

    async def works(*args: Any, **kwargs: Any) -> bool:
        return True

    monkeypatch.setattr(codes, "send_email", works)
    retry = await client.post(REQUEST, headers=auth_header(player))
    assert retry.status_code == 200  # a failed send does not count against the 60 s wait
    code = last_code(user.id, OtpPurpose.account_deletion)
    done = await client.post(VERIFY, headers=auth_header(player), json={"code": code})
    assert done.status_code == 200
