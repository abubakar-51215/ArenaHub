"""Bank-detail changes (app/modules/arena/service.py, the ``bank_details_change`` purpose):
adding or removing an account always needs the emailed code; editing needs one only when the
account number, title or bank changes — a pure default/active switch applies at once, as before.
The proposed change is staged in Redis, keyed to the owner and the arena, and a code can only ever
apply the change it was issued for (codes.py: a new code for the same user+purpose always ends
the older one, and a new request always replaces the older staged payload with it)."""

from datetime import timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.email.smtp import EmailSendError
from app.modules.auth import repository as repo
from app.modules.auth.model import OtpVerification
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import arena_payload, auth_header, last_code, make_user

BASE_ACCOUNT = {
    "bank_name": "Meezan Bank",
    "account_title": "ArenaHub Sports",
    "account_number": "1111111111",
}


async def _owner_and_arena(
    client: AsyncClient, db: AsyncSession, email: str
) -> tuple[dict, Any, str]:
    owner, user = await make_user(client, db, email, "owner")
    h = auth_header(owner)
    arena_id = (await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload())).json()[
        "data"
    ]["id"]
    return h, user, arena_id


def _bank_url(arena_id: str, suffix: str = "") -> str:
    return f"/api/v1/owner/arenas/{arena_id}/bank-details{suffix}"


async def _add(client: AsyncClient, h: dict, arena_id: str, **fields: object) -> None:
    """Request adding an account, asserting it needed a code (never created at once)."""
    req = await client.post(_bank_url(arena_id), headers=h, json={**BASE_ACCOUNT, **fields})
    assert req.status_code == 200
    assert req.json()["data"] is None


async def _latest_otp_row(db: AsyncSession, user_id: Any) -> OtpVerification:
    row = await repo.get_latest_otp(db, user_id, OtpPurpose.bank_details_change)
    assert row is not None
    return row


async def _past_the_resend_wait(db: AsyncSession, user_id: Any) -> None:
    """Same trick as test_codes.py's _clear_waits: push the latest code's creation time back
    past the unchanged 60 s resend wait, without actually expiring it (still far under 10 min)."""
    row = await _latest_otp_row(db, user_id)
    row.expires_at -= timedelta(seconds=61)
    await db.commit()


# ---- the gate itself: add/edit/remove -----------------------------------------------------


async def test_add_always_needs_a_code_and_only_exists_after_it(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-add@example.com")
    await _add(client, h, arena_id, label="Main")
    # not created yet — nothing to list
    assert (await client.get(_bank_url(arena_id), headers=h)).json()["data"] == []

    code = last_code(user.id, OtpPurpose.bank_details_change)
    verified = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert verified.status_code == 200
    assert verified.json()["data"]["bank_name"] == "Meezan Bank"
    assert verified.json()["data"]["is_default"] is True  # first account: default automatically
    listed = await client.get(_bank_url(arena_id), headers=h)
    assert len(listed.json()["data"]) == 1


async def test_pure_default_and_active_switch_applies_at_once_sensitive_edit_needs_a_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-edit@example.com")
    await _add(client, h, arena_id)
    first_id = (
        await client.post(
            _bank_url(arena_id, "/verify"),
            headers=h,
            json={"code": last_code(user.id, OtpPurpose.bank_details_change)},
        )
    ).json()["data"]["id"]
    # the first code is already used, so the 60 s wait (which only guards an outstanding,
    # unused code) does not apply to this second, unrelated request
    await _add(client, h, arena_id, account_number="2222222222", bank_name="HBL")
    second_id = (
        await client.post(
            _bank_url(arena_id, "/verify"),
            headers=h,
            json={"code": last_code(user.id, OtpPurpose.bank_details_change)},
        )
    ).json()["data"]["id"]

    # a pure default switch between two accounts already on file: no code, applies at once
    toggled = await client.patch(
        _bank_url(arena_id, f"/{second_id}"), headers=h, json={"is_default": True}
    )
    assert toggled.status_code == 200
    assert toggled.json()["data"]["is_default"] is True

    # an active/inactive switch: also no code
    deactivated = await client.patch(
        _bank_url(arena_id, f"/{first_id}"), headers=h, json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["data"]["is_active"] is False

    # changing the account number: needs a code, and does not apply yet
    edit = await client.patch(
        _bank_url(arena_id, f"/{second_id}"), headers=h, json={"account_number": "9999999999"}
    )
    assert edit.status_code == 200
    assert edit.json()["data"] is None
    unchanged = await client.get(_bank_url(arena_id), headers=h)
    accounts = {a["id"]: a for a in unchanged.json()["data"]}
    assert accounts[second_id]["account_number"] == "2222222222"  # still the old number

    code = last_code(user.id, OtpPurpose.bank_details_change)
    confirmed = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["account_number"] == "9999999999"


async def test_remove_always_needs_a_code(client: AsyncClient, db_session: AsyncSession) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-remove@example.com")
    await _add(client, h, arena_id)
    account_id = (
        await client.post(
            _bank_url(arena_id, "/verify"),
            headers=h,
            json={"code": last_code(user.id, OtpPurpose.bank_details_change)},
        )
    ).json()["data"]["id"]

    delete = await client.delete(_bank_url(arena_id, f"/{account_id}"), headers=h)
    assert delete.status_code == 200
    assert delete.json()["data"] is None
    # still there — removal is not applied until the code is confirmed
    still = await client.get(_bank_url(arena_id), headers=h)
    assert len(still.json()["data"]) == 1

    code = last_code(user.id, OtpPurpose.bank_details_change)
    confirmed = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert confirmed.status_code == 200
    gone = await client.get(_bank_url(arena_id), headers=h)
    assert gone.json()["data"] == []


# ---- the standard code-matrix, same as every other emailed-code purpose -------------------


async def test_verify_with_no_pending_change_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, _, arena_id = await _owner_and_arena(client, db_session, "bd-none@example.com")
    resp = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": "123456"})
    assert resp.status_code == 422
    assert resp.json()["message"] == "No bank account change is pending."


async def test_wrong_code_is_refused(client: AsyncClient, db_session: AsyncSession) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-wrong@example.com")
    await _add(client, h, arena_id)
    real = last_code(user.id, OtpPurpose.bank_details_change)
    wrong = "000000" if real != "000000" else "111111"
    resp = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": wrong})
    assert resp.status_code == 422
    assert resp.json()["message"] == codes.WRONG_CODE_MESSAGE
    # still nothing added
    assert (await client.get(_bank_url(arena_id), headers=h)).json()["data"] == []


async def test_expired_code_is_refused(client: AsyncClient, db_session: AsyncSession) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-expired@example.com")
    await _add(client, h, arena_id)
    code = last_code(user.id, OtpPurpose.bank_details_change)
    row = await _latest_otp_row(db_session, user.id)
    row.expires_at -= timedelta(minutes=11)
    await db_session.commit()
    resp = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert resp.status_code == 422
    assert resp.json()["message"] == codes.WRONG_CODE_MESSAGE


async def test_code_cannot_be_used_twice(client: AsyncClient, db_session: AsyncSession) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-reuse@example.com")
    await _add(client, h, arena_id)
    code = last_code(user.id, OtpPurpose.bank_details_change)
    first = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert first.status_code == 200
    second = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert second.status_code == 422


async def test_five_wrong_tries_locks_the_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-locked@example.com")
    await _add(client, h, arena_id)
    real = last_code(user.id, OtpPurpose.bank_details_change)
    wrong = "000000" if real != "000000" else "111111"
    for _ in range(4):
        await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": wrong})
    fifth = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": wrong})
    assert fifth.json()["message"] == "Too many wrong tries. Ask for a new code."
    locked = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": real})
    assert locked.json()["message"] == "Too many wrong tries. Ask for a new code."


async def test_another_owners_code_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h_a, user_a, arena_a = await _owner_and_arena(client, db_session, "bd-cross-a@example.com")
    h_b, _, arena_b = await _owner_and_arena(client, db_session, "bd-cross-b@example.com")
    await _add(client, h_a, arena_a)
    await _add(client, h_b, arena_b)
    code_a = last_code(user_a.id, OtpPurpose.bank_details_change)
    # owner B, on their own arena, tries owner A's code
    resp = await client.post(_bank_url(arena_b, "/verify"), headers=h_b, json={"code": code_a})
    assert resp.status_code == 422


async def test_a_new_request_replaces_the_older_pending_change_and_its_code(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-replace@example.com")
    await _add(client, h, arena_id, account_title="First try")
    old_code = last_code(user.id, OtpPurpose.bank_details_change)
    # past the 60 s resend wait (same rule as every other purpose — unchanged), a second add
    # request before the first was ever confirmed
    row = await _latest_otp_row(db_session, user.id)
    row.expires_at -= timedelta(seconds=61)
    await db_session.commit()
    await _add(client, h, arena_id, account_title="Second try")
    new_code = last_code(user.id, OtpPurpose.bank_details_change)
    if old_code == new_code:
        pytest.skip("the two random codes are the same")

    # the old code no longer applies anything (it was ended, and its payload was replaced)
    old_attempt = await client.post(
        _bank_url(arena_id, "/verify"), headers=h, json={"code": old_code}
    )
    assert old_attempt.status_code == 422
    assert (await client.get(_bank_url(arena_id), headers=h)).json()["data"] == []

    # the new code applies the SECOND staged change, not the first
    confirmed = await client.post(
        _bank_url(arena_id, "/verify"), headers=h, json={"code": new_code}
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["account_title"] == "Second try"


async def test_pending_change_does_not_cross_arenas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    h, user, arena_a = await _owner_and_arena(client, db_session, "bd-two-arenas@example.com")
    arena_b = (
        await client.post("/api/v1/owner/arenas", headers=h, json=arena_payload(name="Second"))
    ).json()["data"]["id"]

    await _add(client, h, arena_a, account_title="For arena A")
    code_a = last_code(user.id, OtpPurpose.bank_details_change)
    # confirming it against arena B (same owner, same code purpose, different arena) is refused:
    # there is nothing staged for arena B
    cross = await client.post(_bank_url(arena_b, "/verify"), headers=h, json={"code": code_a})
    assert cross.status_code == 422
    assert cross.json()["message"] == "No bank account change is pending."
    # arena A's own change is unaffected and still confirms normally
    ok = await client.post(_bank_url(arena_a, "/verify"), headers=h, json={"code": code_a})
    assert ok.status_code == 200


async def test_a_failed_send_is_reported_and_resend_works(
    client: AsyncClient, db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mirrors the existing codes.py pattern (test_codes.py): the sender is swapped out, so no
    real address — reserved or otherwise — is ever actually contacted."""
    h, user, arena_id = await _owner_and_arena(client, db_session, "bd-failsend@example.com")

    async def broken(*args: Any, **kwargs: Any) -> None:
        raise EmailSendError("cannot connect or timed out", "Check EMAIL_HOST.", temporary=True)

    monkeypatch.setattr(codes, "send_email", broken)
    req = await client.post(_bank_url(arena_id), headers=h, json=BASE_ACCOUNT)
    assert req.status_code == 503
    assert req.json()["message"] == codes.NOT_SENT_MESSAGE

    async def works(*args: Any, **kwargs: Any) -> bool:
        return True

    monkeypatch.setattr(codes, "send_email", works)
    retry = await client.post(_bank_url(arena_id), headers=h, json=BASE_ACCOUNT)
    assert retry.status_code == 200  # a failed send does not count against the 60 s wait
    code = last_code(user.id, OtpPurpose.bank_details_change)
    confirmed = await client.post(_bank_url(arena_id, "/verify"), headers=h, json={"code": code})
    assert confirmed.status_code == 200
