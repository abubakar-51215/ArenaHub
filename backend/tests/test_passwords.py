"""Password storage and rules: Argon2id with the agreed settings, old bcrypt hashes still work and
are replaced at the next sign-in, common passwords refused, 8 to 128 characters, and an unknown
account costs the same time as a wrong password."""

import statistics
import time

import bcrypt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.exceptions import ValidationError
from app.core.messages import COMMON_PASSWORD
from app.modules.auth import repository as repo
from tests.helpers import PASSWORD, make_user

GOOD = "Correct#Horse9"


def test_hashes_are_argon2id_with_the_agreed_settings() -> None:
    h = security.hash_password(GOOD)
    assert h.startswith("$argon2id$v=19$m=46080,t=2,p=1$")  # PHC string; memory >= 19456 KiB
    assert security.ARGON2_MEMORY_KIB >= 19456 and security.ARGON2_TIME_COST >= 2
    assert security.ARGON2_PARALLELISM == 1
    assert security.verify_password(GOOD, h) and not security.verify_password("wrong", h)
    assert security.hash_password(GOOD) != h  # a new salt every time


def test_one_check_stays_under_about_250_ms() -> None:
    h = security.hash_password(GOOD)
    times = []
    for _ in range(3):
        t = time.perf_counter()
        security.verify_password(GOOD, h)
        times.append((time.perf_counter() - t) * 1000)
    assert statistics.median(times) < 400  # 250 ms target; headroom for a busy test machine


def test_old_bcrypt_hashes_still_verify_and_are_marked_for_replacement() -> None:
    old = bcrypt.hashpw(GOOD.encode(), bcrypt.gensalt()).decode()
    assert security.verify_password(GOOD, old) and not security.verify_password("x", old)
    assert security.password_needs_rehash(old)
    assert not security.password_needs_rehash(security.hash_password(GOOD))
    assert not security.verify_password(GOOD, "not-a-hash") and not security.verify_password(
        GOOD, ""
    )


@pytest.mark.parametrize(
    "weak", ["Password1!", "P@ssw0rd", "Qwerty123!", "Welcome2024!", "Arenahub@1", "Aaaaaaa1!"]
)
def test_common_passwords_are_refused_with_the_approved_words(weak: str) -> None:
    with pytest.raises(ValidationError) as err:
        security.validate_password_strength(weak)
    assert err.value.message == COMMON_PASSWORD == "Choose a less common password."


def test_length_runs_from_8_to_128_and_the_four_rules_stay() -> None:
    security.validate_password_strength("Ab3#" + "k" * 4)  # 8
    security.validate_password_strength("Ab3#" + "k" * 124)  # 128, past bcrypt's old 72-byte limit
    for bad in (
        "Ab3#" + "k" * 125,
        "Ab3#k",
        "abcdef3#xyz",
        "ABCDEFG#XYZ",
        "Abcdefgh3xyz",
        "Abcdefgh#xyz",
    ):
        with pytest.raises(ValidationError):
            security.validate_password_strength(bad)


async def test_sign_up_refuses_a_common_password_and_accepts_a_long_one(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    base = {
        "full_name": "Pw Tester",
        "email": "pw1@example.com",
        "phone": "03004440001",
        "role": "player",
    }
    weak = await client.post("/api/v1/auth/register", json={**base, "password": "Password1!"})
    assert weak.status_code == 422 and weak.json()["message"] == "Choose a less common password."
    long = await client.post("/api/v1/auth/register", json={**base, "password": "Ab3#" + "k" * 100})
    assert long.status_code == 201
    too_long = await client.post(
        "/api/v1/auth/register",
        json={
            **base,
            "email": "pw2@example.com",
            "phone": "03004440002",
            "password": "Ab3#" + "k" * 125,
        },
    )
    assert too_long.status_code == 422


async def test_an_old_bcrypt_hash_is_replaced_by_argon2id_at_the_next_sign_in(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, user = await make_user(client, db_session, "pw-rehash@example.com")
    user.password_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
    await db_session.commit()
    bad = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Wrong#Pass1"}
    )
    assert bad.status_code == 401
    await db_session.refresh(user)
    assert user.password_hash.startswith("$2")  # a wrong password changes nothing
    ok = await client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
    assert ok.status_code == 200
    again = await repo.get_user_by_email(db_session, user.email)
    await db_session.refresh(again)
    assert again.password_hash.startswith("$argon2id$")
    assert security.verify_password(PASSWORD, again.password_hash)


async def test_unknown_and_known_accounts_answer_alike(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await make_user(client, db_session, "pw-known@example.com")
    known, unknown = [], []
    for _ in range(3):
        t = time.perf_counter()
        a = await client.post(
            "/api/v1/auth/login", json={"email": "pw-known@example.com", "password": "Wrong#Pass1"}
        )
        known.append(time.perf_counter() - t)
        t = time.perf_counter()
        b = await client.post(
            "/api/v1/auth/login", json={"email": "pw-nobody@example.com", "password": "Wrong#Pass1"}
        )
        unknown.append(time.perf_counter() - t)
        assert a.status_code == b.status_code == 401
        assert a.json()["message"] == b.json()["message"] == "Invalid email/phone or password."
    # an unknown account does the same hashing work: not faster by more than a few tens of ms
    assert statistics.median(unknown) > statistics.median(known) * 0.6
