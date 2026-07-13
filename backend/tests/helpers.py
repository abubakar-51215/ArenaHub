"""Shared test helpers: register + verify a user of a given role, promote to
admin, build auth headers, and a valid arena payload."""

import itertools
from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth import repository as repo
from app.modules.user.model import User, UserRole

PASSWORD = "StrongP@ss1"

# Unique phone numbers per registered user (phone is unique in the schema).
_phone_counter = itertools.count(3000000000)


async def make_user(
    client: AsyncClient, db: AsyncSession, email: str, role: str = "player"
) -> tuple[dict, User]:
    """Register + verify a user; return (tokens, user row)."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "full_name": "Test User",
            "email": email,
            "phone": f"0{next(_phone_counter)}",
            "password": PASSWORD,
            "role": role,
        },
    )
    user = await repo.get_user_by_email(db, email)
    assert user is not None
    otp = await repo.get_latest_otp(db, user.id)
    assert otp is not None
    resp = await client.post("/api/v1/auth/verify-otp", json={"email": email, "code": otp.code})
    return resp.json()["data"], user


async def make_admin(client: AsyncClient, db: AsyncSession, email: str) -> dict:
    """Register a user then flip the row to admin (admins aren't self-served).

    ``get_current_user`` reads the role from the DB per request, so the existing
    access token resolves to the elevated role on the same transaction.
    """
    tokens, user = await make_user(client, db, email, role="owner")
    user.role = UserRole.admin
    await db.commit()
    return tokens


def auth_header(tokens: dict) -> dict:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def arena_payload(**overrides: Any) -> dict:
    payload: dict[str, Any] = {
        "name": "Downtown Futsal Arena",
        "description": "Indoor futsal courts",
        "address": "123 Main Blvd",
        "city": "Lahore",
        "area": "Gulberg",
        "latitude": "31.5204",
        "longitude": "74.3587",
        "contact_phone": "0421234567",
        "contact_email": "arena@example.com",
        "operating_hours": {
            "monday": {"open": "08:00", "close": "23:00"},
            "saturday": {"open": "06:00", "close": "23:59"},
        },
        "sports_offered": ["futsal", "cricket"],
        "images": [],
        "amenity_ids": [],
        "advance_percentage": 50,
        "require_full_payment": False,
        "refund_policy": [{"hours_before": 24, "refund_percentage": 100}],
    }
    payload.update(overrides)
    return payload
