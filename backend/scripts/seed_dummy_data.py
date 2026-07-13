"""Dummy/demo data for the owner web dashboard — dev convenience only.

Populates realistic arenas, courts, peak-pricing rules, a discount code, and a
blocked date under the existing seeded owner account (owner@arenahub.pk) so
the dashboard has something to look at while building/reviewing UI. Arena
names/cities mirror design/wireframes/ArenaOwners.PNG's sample data.

Safe to re-run: skips any arena that already exists (by name) for the owner.
Every arena/court/rule/discount/blocked-date this script creates is recorded
in `.seed_manifest.json` (gitignored) so `clear_dummy_data.py` can remove
exactly this data later without touching anything created manually.

Usage (from backend/):
    uv run python scripts/seed_dummy_data.py
    uv run python scripts/clear_dummy_data.py
"""

import asyncio
import json
from datetime import date, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database.session import SessionFactory
from app.modules.arena.model import (
    Arena,
    ArenaBlockedDate,
    ArenaStatus,
    DiscountCode,
    DiscountType,
)
from app.modules.court.model import Court, CourtPricingRule
from app.modules.user.model import User, UserRole

MANIFEST_PATH = Path(__file__).parent / ".seed_manifest.json"

OWNER_EMAIL = "owner@arenahub.pk"
OWNER_PHONE = "03001112233"
DEMO_PASSWORD = "Owner@1234"

_HOURS = {
    "monday": {"open": "06:00", "close": "23:00"},
    "tuesday": {"open": "06:00", "close": "23:00"},
    "wednesday": {"open": "06:00", "close": "23:00"},
    "thursday": {"open": "06:00", "close": "23:00"},
    "friday": {"open": "06:00", "close": "23:00"},
    "saturday": {"open": "06:00", "close": "23:59"},
    "sunday": {"open": "06:00", "close": "23:59"},
}

# (name, city, area, lat, lng, status, is_active, sports, courts)
# courts: (name, sport_types, capacity, base_price, is_available)
ARENAS = [
    (
        "Arena Hub DHA Lahore",
        "Lahore",
        "DHA Phase 5",
        Decimal("31.4697"),
        Decimal("74.4142"),
        ArenaStatus.approved,
        True,
        ["futsal", "cricket", "padel"],
        [
            ("Court 1", ["futsal"], 10, Decimal("2500.00"), True),
            ("Court 2", ["futsal"], 10, Decimal("2500.00"), True),
            ("Court 3", ["cricket"], 16, Decimal("3000.00"), True),
            ("Court 4", ["padel"], 4, Decimal("2800.00"), True),
        ],
    ),
    (
        "Arena Hub Gulberg Lahore",
        "Lahore",
        "Gulberg III",
        Decimal("31.5204"),
        Decimal("74.3587"),
        ArenaStatus.approved,
        True,
        ["futsal", "cricket", "padel"],
        [
            ("Court 1", ["futsal"], 10, Decimal("2500.00"), True),
            ("Court 2", ["cricket"], 16, Decimal("2800.00"), True),
            ("Court 3", ["padel"], 4, Decimal("3000.00"), False),
        ],
    ),
    (
        "Arena Hub Clifton Karachi",
        "Karachi",
        "Clifton Block 5",
        Decimal("24.8138"),
        Decimal("67.0300"),
        ArenaStatus.pending,
        True,
        ["futsal", "cricket"],
        [
            ("Court 1", ["futsal"], 10, Decimal("2800.00"), True),
            ("Court 2", ["cricket"], 16, Decimal("2800.00"), True),
        ],
    ),
    (
        "Arena Hub Bahria Town Lahore",
        "Lahore",
        "Bahria Town",
        Decimal("31.3703"),
        Decimal("74.1815"),
        ArenaStatus.approved,
        False,  # deactivated — demonstrates the "Inactive" state
        ["cricket", "futsal"],
        [
            ("Court 1", ["cricket"], 16, Decimal("3200.00"), True),
            ("Court 2", ["futsal"], 10, Decimal("2800.00"), True),
        ],
    ),
    (
        "Arena Hub Johar Town Lahore",
        "Lahore",
        "Johar Town",
        Decimal("31.4697"),
        Decimal("74.2728"),
        ArenaStatus.rejected,
        True,
        ["futsal"],
        [
            ("Court 1", ["futsal"], 10, Decimal("2500.00"), True),
        ],
    ),
]

REJECTION_REASON = "Photos are too blurry — please re-upload clear, well-lit court photos."


async def _get_or_create_owner(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == OWNER_EMAIL))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        full_name="Demo Owner",
        email=OWNER_EMAIL,
        phone=OWNER_PHONE,
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.owner,
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def seed() -> None:
    manifest: dict = {"arenas": []}
    async with SessionFactory() as db:
        owner = await _get_or_create_owner(db)

        existing = await db.execute(select(Arena.name).where(Arena.owner_id == owner.id))
        existing_names = {row[0] for row in existing.all()}

        for (
            name,
            city,
            area,
            lat,
            lng,
            status,
            is_active,
            sports,
            courts,
        ) in ARENAS:
            if name in existing_names:
                print(f"skip (already exists): {name}")
                continue

            arena = Arena(
                owner_id=owner.id,
                name=name,
                description=f"{name} — a premium sports facility offering {', '.join(sports)}.",
                address=f"{area}, {city}",
                city=city,
                area=area,
                latitude=lat,
                longitude=lng,
                contact_phone="0421234567",
                contact_email="info@arenahub.pk",
                operating_hours=_HOURS,
                sports_offered=sports,
                images=[],
                status=status,
                rejection_reason=REJECTION_REASON if status == ArenaStatus.rejected else None,
                advance_percentage=50,
                require_full_payment=False,
                refund_policy=[
                    {"hours_before": 24, "refund_percentage": 100},
                    {"hours_before": 6, "refund_percentage": 50},
                ],
                is_active=is_active,
            )
            db.add(arena)
            await db.flush()
            arena_manifest = {"id": str(arena.id), "name": name, "court_ids": []}

            court_rows = []
            for court_name, sport_types, capacity, base_price, is_available in courts:
                court = Court(
                    arena_id=arena.id,
                    name=court_name,
                    description=f"{court_name} at {name}",
                    sport_types=sport_types,
                    capacity=capacity,
                    base_price=base_price,
                    images=[],
                    is_available=is_available,
                )
                db.add(court)
                court_rows.append(court)
            await db.flush()
            arena_manifest["court_ids"] = [str(c.id) for c in court_rows]

            # Peak-pricing rules on the first court of the first two arenas.
            if court_rows and name in ("Arena Hub DHA Lahore", "Arena Hub Gulberg Lahore"):
                first_court = court_rows[0]
                db.add(
                    CourtPricingRule(
                        court_id=first_court.id,
                        name="Weekday Evening",
                        weekday=None,
                        start_time=time(18, 0),
                        end_time=time(22, 0),
                        price_multiplier=Decimal("1.10"),
                        is_active=True,
                    )
                )
                db.add(
                    CourtPricingRule(
                        court_id=first_court.id,
                        name="Weekend Peak",
                        weekday=6,  # Saturday
                        start_time=time(16, 0),
                        end_time=time(23, 59),
                        price_multiplier=Decimal("1.25"),
                        is_active=True,
                    )
                )

            # A discount code + a blocked date on the first arena only.
            if name == "Arena Hub DHA Lahore":
                db.add(
                    DiscountCode(
                        arena_id=arena.id,
                        code="WELCOME10",
                        description="10% off for first-time bookers",
                        discount_type=DiscountType.percentage,
                        discount_value=Decimal("10"),
                        min_booking_amount=Decimal("1000"),
                        max_uses=100,
                        is_active=True,
                    )
                )
                db.add(
                    ArenaBlockedDate(
                        arena_id=arena.id,
                        blocked_date=date(2026, 8, 14),
                        reason="Public holiday — closed",
                    )
                )

            manifest["arenas"].append(arena_manifest)
            print(f"created: {name} ({status.value}, {len(court_rows)} courts)")

        await db.commit()

    if manifest["arenas"]:
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))
        print(f"\nWrote manifest: {MANIFEST_PATH}")
    else:
        print("\nNothing new to seed — all demo arenas already exist.")


if __name__ == "__main__":
    asyncio.run(seed())
