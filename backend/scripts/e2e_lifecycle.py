"""Full lifecycle smoke test, in-process, against ``arenahub_scratch`` ONLY.

Registers a fresh arena owner, creates an arena/court/slots, has the admin
seed account approve it, registers a fresh player, books a slot, pays by
bank transfer, has the owner approve the receipt, and checks the booking
confirms and the right notifications fire to both sides.

Run it yourself (from backend/):

    uv run python scripts/e2e_lifecycle.py

Safety: this script repoints ``DATABASE_URL`` at ``<same host>/arenahub_scratch``
before anything imports ``app.main`` (mirrors ``tests/conftest.py``'s ``_test``
database trick) and refuses to run if that database name is not literally
``arenahub_scratch`` — it will never touch the dev database. The database is
created and migrated automatically the first time; later runs reuse it (each
run tags its own rows with a random suffix, so repeat runs don't collide).

Drives the ASGI app directly in-process (httpx + ASGITransport), the same way
the pytest suite does — no separate server process needed. OTP/2FA codes are
read straight from structlog's captured events (dev-mode console delivery),
not a log file.
"""

import asyncio
import io
import os
import subprocess
import sys
import uuid
from collections.abc import MutableMapping
from pathlib import Path
from typing import Any

from dotenv import dotenv_values

SCRATCH_DB_NAME = "arenahub_scratch"
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _scratch_database_url() -> str:
    env_path = BACKEND_DIR / ".env"
    dev_url = os.environ.get("DATABASE_URL") or dotenv_values(env_path).get("DATABASE_URL")
    if not dev_url:
        raise SystemExit("DATABASE_URL not set in the environment or backend/.env.")
    root, _, _dbname = dev_url.rpartition("/")
    return f"{root}/{SCRATCH_DB_NAME}"


SCRATCH_URL = _scratch_database_url()
_actual_dbname = SCRATCH_URL.rsplit("/", 1)[-1]
if _actual_dbname != SCRATCH_DB_NAME:
    raise SystemExit(
        f"Refusing to run: this script only ever targets '{SCRATCH_DB_NAME}', "
        f"computed '{_actual_dbname}' instead. Nothing was touched."
    )

# Must happen before anything imports app.main (Settings() is built at module
# scope there and cached for the process) — same trick as tests/conftest.py.
os.environ["DATABASE_URL"] = SCRATCH_URL
os.environ.setdefault("JAZZCASH_WEBHOOK_SECRET", "scratch-jazzcash-webhook-secret")
os.environ.setdefault("EASYPAISA_WEBHOOK_SECRET", "scratch-easypaisa-webhook-secret")
os.environ.setdefault("ENVIRONMENT", "dev")
os.environ.setdefault("EMAIL_SEND_IN_DEV", "0")  # scratch runs never need real email


async def _ensure_scratch_database_exists() -> bool:
    """True if the database had to be created (so we know to run migrations)."""
    import asyncpg

    admin_url = SCRATCH_URL.rsplit("/", 1)[0] + "/postgres"
    admin_url = admin_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(admin_url)
    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", SCRATCH_DB_NAME
        )
        if not exists:
            # identifier, not a value — $1 can't be used for a database name
            await conn.execute(f'CREATE DATABASE "{SCRATCH_DB_NAME}"')
            return True
        return False
    finally:
        await conn.close()


def _run_migrations() -> None:
    print(f"'{SCRATCH_DB_NAME}' is new — running migrations once...")
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": SCRATCH_URL},
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise SystemExit("Migrating arenahub_scratch failed — see output above.")


created = asyncio.run(_ensure_scratch_database_exists())
if created:
    _run_migrations()

# Safe to import app.main now: DATABASE_URL is locked to arenahub_scratch.
import structlog  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database.session import SessionFactory  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.user.model import User, UserRole  # noqa: E402

ADMIN_EMAIL = "admin@arenahub.pk"
ADMIN_PHONE = "03000000000"
ADMIN_PASSWORD = "StrongP@ss1"

PASS: list[str] = []
FAIL: list[str] = []


async def _ensure_admin_seeded() -> None:
    """Admins never self-register — mirrors scripts/seed_dummy_data.py's
    _get_or_create_admin so a fresh arenahub_scratch has someone to approve
    the arena with."""
    async with SessionFactory() as db:
        result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        existing = result.scalar_one_or_none()
        if existing:
            return
        db.add(User(
            full_name="Platform Admin",
            email=ADMIN_EMAIL,
            phone=ADMIN_PHONE,
            password_hash=hash_password(ADMIN_PASSWORD),
            role=UserRole.admin,
            is_verified=True,
            is_active=True,
        ))
        await db.commit()


def check(label: str, cond: bool, detail: object = "") -> None:
    if cond:
        PASS.append(label)
        print(f"  [PASS] {label}")
    else:
        FAIL.append(f"{label} :: {detail}")
        print(f"  [FAIL] {label} :: {detail}")


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def latest_code(
    events: list[MutableMapping[str, Any]], destination: str, purpose: str
) -> str | None:
    matches = [
        e["code"]
        for e in events
        if e.get("event") == "code_dev_delivery"
        and e.get("destination") == destination
        and e.get("purpose") == purpose
    ]
    return matches[-1] if matches else None


def png_bytes() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (10, 120, 40)).save(buf, format="PNG")
    return buf.getvalue()


async def main() -> int:
    await _ensure_admin_seeded()

    tag = uuid.uuid4().hex[:8]
    owner_email = f"e2e.owner.{tag}@example.com"
    player_email = f"e2e.player.{tag}@example.com"
    owner_phone = "03" + str(uuid.uuid4().int)[:9]
    player_phone = "03" + str(uuid.uuid4().int)[9:18]
    password = "TestPass123!"

    with structlog.testing.capture_logs() as logs:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
            # -------------------------------------------------- 1. owner registers
            step("1. Register arena owner")
            r = await c.post("/auth/register", json={
                "full_name": "E2E Test Owner",
                "email": owner_email,
                "phone": owner_phone,
                "password": password,
                "role": "owner",
            })
            check("owner registration accepted (201)", r.status_code == 201, r.text)
            code = latest_code(logs, owner_email, "registration")
            check("owner OTP captured", code is not None)
            r = await c.post("/auth/verify-otp", json={"email": owner_email, "code": code})
            check("owner OTP verified", r.status_code == 200, r.text)
            owner_h = {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

            # -------------------------------------------------- 2. create arena
            step("2. Owner creates an arena")
            days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            r = await c.post("/owner/arenas", json={
                "name": f"E2E Test Arena {tag}",
                "description": "Created by the automated lifecycle script.",
                "address": "123 Test Street, Gulberg",
                "city": "Lahore",
                "area": "Gulberg",
                "latitude": "31.5204",
                "longitude": "74.3587",
                "contact_phone": owner_phone,
                "contact_email": owner_email,
                "operating_hours": {d: {"open": "08:00", "close": "23:00"} for d in days},
                "sports_offered": ["futsal"],
                "images": [],
                "amenity_ids": [],
                "advance_percentage": 100,
                "require_full_payment": True,
                "refund_policy": [],
            }, headers=owner_h)
            check("arena created (201)", r.status_code == 201, r.text)
            arena = r.json()["data"]
            arena_id = arena["id"]
            check("arena status is 'pending'", arena.get("status") == "pending", arena)

            # -------------------------------------------------- 3. court + slots
            step("3. Owner adds a court and generates slots")
            r = await c.post(f"/owner/arenas/{arena_id}/courts", json={
                "name": "Court 1",
                "description": "Main futsal court",
                "sport_types": ["futsal"],
                "capacity": 10,
                "base_price": "2000.00",
                "images": [],
                "is_available": True,
            }, headers=owner_h)
            check("court created (201)", r.status_code == 201, r.text)
            court_id = r.json()["data"]["id"]

            import datetime as dt
            start = dt.date.today() + dt.timedelta(days=1)
            end = start + dt.timedelta(days=2)
            r = await c.post(
                f"/owner/courts/{court_id}/slots/generate",
                json={"start_date": start.isoformat(), "end_date": end.isoformat()},
                headers=owner_h,
            )
            check("slots generated (201)", r.status_code == 201, r.text)
            check("at least one slot created", r.json()["data"].get("created", 0) > 0, r.json())

            # -------------------------------------------------- 4. admin approves
            step("4. Admin logs in and approves the arena")
            r = await c.post(
                "/auth/login", json={"email": "admin@arenahub.pk", "password": "StrongP@ss1"}
            )
            admin_ok = r.status_code == 200 and r.json()["data"].get("mfa_required")
            check("admin login step 1 (challenge issued)", admin_ok, r.text)
            challenge_token = r.json()["data"]["challenge_token"]
            admin_code = latest_code(logs, "admin@arenahub.pk", "admin_login")
            check("admin 2FA code captured", admin_code is not None)
            r = await c.post(
                "/auth/admin/verify-code",
                json={"challenge_token": challenge_token, "code": admin_code},
            )
            check("admin 2FA verified", r.status_code == 200, r.text)
            admin_h = {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

            r = await c.get("/admin/arenas", params={"status": "pending"}, headers=admin_h)
            check("admin can see verification queue", r.status_code == 200, r.text)
            items = r.json()["data"]
            items = items.get("items", items) if isinstance(items, dict) else items
            in_queue = isinstance(items, list) and any(a.get("id") == arena_id for a in items)
            check("new arena appears in admin's pending queue", in_queue, items)

            r = await c.post(f"/admin/arenas/{arena_id}/approve", headers=admin_h)
            check("admin approves arena (200)", r.status_code == 200, r.text)
            approved = r.json()["data"].get("status") == "approved"
            check("arena status now 'approved'", approved, r.json())

            # -------------------------------------------------- 5. player registers
            step("5. Register player and verify the arena is publicly visible")
            r = await c.post("/auth/register", json={
                "full_name": "E2E Test Player",
                "email": player_email,
                "phone": player_phone,
                "password": password,
                "role": "player",
            })
            check("player registration accepted (201)", r.status_code == 201, r.text)
            pcode = latest_code(logs, player_email, "registration")
            check("player OTP captured", pcode is not None)
            r = await c.post("/auth/verify-otp", json={"email": player_email, "code": pcode})
            check("player OTP verified", r.status_code == 200, r.text)
            player_h = {"Authorization": f"Bearer {r.json()['data']['access_token']}"}

            r = await c.get(f"/arenas/{arena_id}", headers=player_h)
            check("player can see the now-approved arena", r.status_code == 200, r.text)

            # -------------------------------------------------- 6. book a slot
            step("6. Player books a slot")
            r = await c.get(
                f"/courts/{court_id}/slots", params={"date": start.isoformat()}, headers=player_h
            )
            check("player can list available slots", r.status_code == 200, r.text)
            slots = r.json()["data"]
            slot_list = slots.get("items", slots) if isinstance(slots, dict) else slots
            has_slots = isinstance(slot_list, list) and len(slot_list) > 0
            check("at least one open slot to book", has_slots, slots)
            slot_id = slot_list[0]["id"] if slot_list else None

            r = await c.post("/bookings", json={
                "court_id": court_id,
                "slot_ids": [slot_id],
                "payment_type": "full",
                "equipment": [],
            }, headers=player_h)
            check("booking created", r.status_code in (200, 201), r.text)
            booking_group = r.json()["data"]
            group_id = booking_group.get("id") or booking_group.get("booking_group_id")
            check("booking group id returned", bool(group_id), booking_group)

            # -------------------------------------------------- 7. pay + receipt
            step("7. Player pays by bank transfer and uploads a receipt")
            r = await c.post("/payments/initiate", json={
                "booking_group_id": group_id,
                "payment_method": "bank_transfer",
            }, headers=player_h)
            check("payment initiated", r.status_code in (200, 201), r.text)
            payment_id = r.json()["data"].get("payment", {}).get("id")
            check("payment id returned", bool(payment_id), r.json())

            files = {"file": ("receipt.png", png_bytes(), "image/png")}
            r = await c.post(
                "/uploads/image", params={"folder": "receipts"}, files=files, headers=player_h
            )
            check("receipt image uploaded", r.status_code == 200, r.text)
            receipt_url = r.json()["data"]["url"]

            r = await c.post(
                f"/payments/{payment_id}/receipt",
                json={"receipt_proof_url": receipt_url},
                headers=player_h,
            )
            check("receipt submitted, awaiting owner approval", r.status_code == 200, r.text)

            # -------------------------------------------------- 8. owner approves
            step("8. Owner approves the receipt -> booking confirmed")
            r = await c.post(f"/owner/payments/{payment_id}/approve", headers=owner_h)
            check("owner approves payment", r.status_code == 200, r.text)
            resolved = r.json()["data"].get("status") in ("completed", "confirmed", "paid")
            check("payment status reflects approval", resolved, r.json())

            r = await c.get(f"/bookings/group/{group_id}", headers=player_h)
            check("player can fetch final booking group", r.status_code == 200, r.text)
            print("  final booking group status:", r.json()["data"].get("status"))

            # -------------------------------------------------- 9. notifications
            step("9. Notifications fired to both sides")
            r = await c.get("/notifications", headers=player_h)
            if r.status_code == 200:
                player_events = [n["event"] for n in r.json()["data"]["items"]]
            else:
                player_events = []
            player_got_it = "booking_confirmed" in player_events
            check("player received booking_confirmed", player_got_it, player_events)

            r = await c.get("/notifications", headers=owner_h)
            if r.status_code == 200:
                owner_events = [n["event"] for n in r.json()["data"]["items"]]
            else:
                owner_events = []
            owner_got_receipt = "receipt_to_review" in owner_events
            check("owner received receipt_to_review", owner_got_receipt, owner_events)
            check(
                "owner received new_confirmed_booking/arena_approved",
                any(e in owner_events for e in ("new_confirmed_booking", "arena_approved")),
                owner_events,
            )

    print("\n" + "=" * 60)
    db_name = SCRATCH_URL.rsplit("/", 1)[-1]
    print(f"Database: {db_name}  |  PASSED: {len(PASS)}  FAILED: {len(FAIL)}")
    if FAIL:
        print("\nFailures:")
        for f in FAIL:
            print(" -", f)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
