"""Wrong-email recovery: a sign-up that was never confirmed is replaced by a new one with the same
phone or email; a confirmed account still refuses. Resend answers one way for every address."""

from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.email.smtp import EmailSendError
from app.modules.auth import repository as repo
from app.modules.auth.model import OtpVerification
from app.modules.user.model import User
from app.shared import codes
from app.shared.otp import OtpPurpose
from tests.helpers import PASSWORD, last_code, make_user

REGISTER = "/api/v1/auth/register"
VERIFY = "/api/v1/auth/verify-otp"
RESEND = "/api/v1/auth/resend-otp"
RESEND_ANSWER = "If that email can receive a code, we sent one."


def _body(email: str, phone: str, name: str = "First Try", role: str = "player") -> dict:
    return {"full_name": name, "email": email, "phone": phone, "password": PASSWORD, "role": role}


async def _accounts(db: AsyncSession) -> int:
    return int(await db.scalar(select(func.count()).select_from(User)) or 0)


async def test_a_never_confirmed_sign_up_is_replaced_by_the_same_phone(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    first = await client.post(REGISTER, json=_body("typo@gmial.com", "03111000001"))
    assert first.status_code == 201
    before = await _accounts(db_session)

    again = await client.post(
        REGISTER, json=_body("right@gmail.com", "03111000001", "Second Try", "owner")
    )
    assert again.status_code == 201
    assert again.json()["data"]["otp_sent_to"] == "r***@gmail.com"
    assert await _accounts(db_session) == before  # the same account, not a second one
    user = await repo.get_user_by_email(db_session, "right@gmail.com")
    await db_session.refresh(user)
    assert user.full_name == "Second Try" and user.role.value == "owner" and not user.is_verified
    assert await repo.get_user_by_email(db_session, "typo@gmial.com") is None

    code = last_code(user.id, OtpPurpose.registration)
    ok = await client.post(VERIFY, json={"email": "right@gmail.com", "code": code})
    assert ok.status_code == 200


async def test_a_never_confirmed_sign_up_is_replaced_by_the_same_email(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    assert (await client.post(REGISTER, json=_body("same@x.pk", "03111000011"))).status_code == 201
    again = await client.post(REGISTER, json=_body("same@x.pk", "03111000012", "New Name"))
    assert again.status_code == 201
    user = await repo.get_user_by_email(db_session, "same@x.pk")
    await db_session.refresh(user)
    assert user.phone == "03111000012" and user.full_name == "New Name"


async def test_two_unconfirmed_sign_ups_become_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    assert (await client.post(REGISTER, json=_body("one@x.pk", "03111000021"))).status_code == 201
    assert (await client.post(REGISTER, json=_body("two@x.pk", "03111000022"))).status_code == 201
    before = await _accounts(db_session)
    # the email of the first and the phone of the second: the phone's account carries on
    res = await client.post(REGISTER, json=_body("one@x.pk", "03111000022"))
    assert res.status_code == 201
    assert await _accounts(db_session) == before - 1
    user = await repo.get_user_by_email(db_session, "one@x.pk")
    await db_session.refresh(user)
    assert user.phone == "03111000022"


async def test_a_confirmed_account_still_refuses_with_the_usual_words(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "taken@x.pk")
    by_email = await client.post(REGISTER, json=_body("taken@x.pk", "03111000031"))
    assert by_email.status_code == 409
    assert by_email.json()["message"] == "Email is already registered."
    by_phone = await client.post(REGISTER, json=_body("free@x.pk", user.phone))
    assert by_phone.status_code == 409
    assert by_phone.json()["message"] == "Phone number is already registered."
    await db_session.refresh(user)
    assert user.email == "taken@x.pk" and user.is_verified


async def test_old_codes_die_when_the_sign_up_is_replaced(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    assert (await client.post(REGISTER, json=_body("old@x.pk", "03111000041"))).status_code == 201
    user = await repo.get_user_by_email(db_session, "old@x.pk")
    old_code = last_code(user.id, OtpPurpose.registration)
    assert (await client.post(REGISTER, json=_body("new@x.pk", "03111000041"))).status_code == 201
    waiting = await db_session.scalar(
        select(func.count())
        .select_from(OtpVerification)
        .where(OtpVerification.user_id == user.id, OtpVerification.used_at.is_(None))
    )
    assert waiting == 1  # only the new code
    new_code = last_code(user.id, OtpPurpose.registration)
    if new_code != old_code:
        stale = await client.post(VERIFY, json={"email": "new@x.pk", "code": old_code})
        assert stale.status_code == 422
    fresh = await client.post(VERIFY, json={"email": "new@x.pk", "code": new_code})
    assert fresh.status_code == 200


async def test_the_hourly_code_maximum_still_applies(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    assert (await client.post(REGISTER, json=_body("h0@x.pk", "03111000051"))).status_code == 201
    for n in range(1, codes.CODES_PER_HOUR):
        res = await client.post(REGISTER, json=_body(f"h{n}@x.pk", "03111000051"))
        assert res.status_code == 201, n
    over = await client.post(REGISTER, json=_body("h-over@x.pk", "03111000051"))
    assert over.status_code == 429
    assert over.json()["message"] == codes.TOO_MANY_CODES_MESSAGE
    # nothing was changed by the refused try
    assert await repo.get_user_by_email(db_session, "h-over@x.pk") is None
    user = await repo.get_user_by_phone(db_session, "03111000051")
    assert (
        await repo.count_recent_otps(
            db_session, user.id, OtpPurpose.registration, timedelta(hours=1)
        )
        == codes.CODES_PER_HOUR
    )


async def test_a_replaced_sign_up_answers_like_a_new_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Nothing tells whether an unconfirmed account held that email or phone."""
    assert (await client.post(REGISTER, json=_body("held@x.pk", "03111000061"))).status_code == 201
    replaced = await client.post(REGISTER, json=_body("held@x.pk", "03111000062"))
    fresh = await client.post(REGISTER, json=_body("brand-new@x.pk", "03111000063"))
    assert replaced.status_code == fresh.status_code == 201
    assert replaced.json()["message"].split(" to ")[0] == fresh.json()["message"].split(" to ")[0]
    assert set(replaced.json()["data"]) == set(fresh.json()["data"])
    assert replaced.json()["data"]["code_sent"] == fresh.json()["data"]["code_sent"]


async def test_resend_answers_the_same_even_when_the_email_cannot_go_out(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    assert (await client.post(REGISTER, json=_body("out@x.pk", "03111000071"))).status_code == 201
    user = await repo.get_user_by_email(db_session, "out@x.pk")
    # pretend the 60 s since the sign-up code have passed
    rows = (
        await db_session.scalars(select(OtpVerification).where(OtpVerification.user_id == user.id))
    ).all()
    for row in rows:
        row.expires_at -= timedelta(seconds=61)
    await db_session.commit()

    async def broken(*args, **kwargs):
        raise EmailSendError("cannot connect or timed out", "Check EMAIL_HOST.", temporary=True)

    monkeypatch.setattr(codes, "send_email", broken)
    known = await client.post(RESEND, json={"email": "out@x.pk"})
    unknown = await client.post(RESEND, json={"email": "nobody-out@x.pk"})
    assert known.status_code == unknown.status_code == 200
    assert known.json()["message"] == unknown.json()["message"] == RESEND_ANSWER
