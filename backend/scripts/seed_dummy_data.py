"""Dummy/demo data for the web app — dev/FYP-demo convenience only.

Populates a multi-owner, multi-city platform: 5 owner accounts (the original
demo owner plus Ali/Ahmed/Usman/Bilal) each with their own arenas across
Lahore, Multan, Karachi, and Islamabad — courts with sport-specific photos,
peak-pricing rules, a discount code, and a blocked date — plus one admin
account (admins never self-register, so this is the only place one gets
created). On top of that it walks the *player-side* flow end to end — 15
player accounts, generated time slots, bookings in every status, payments
across every method/status, refunds, rented equipment, and reviews (incl.
owner responses and a flagged one) — so every owner's dashboard has real,
varied data instead of empty tables. Arena names/cities mirror
design/wireframes/ArenaOwners.PNG's sample data.

Safe to re-run: skips any arena that already exists (by name) for its owner,
and skips each player-flow section entirely if it was already seeded
(tracked in the manifest, `flow_seeded` / `flow_seeded_v2`). Every row this
script creates is recorded in `.seed_manifest.json` (gitignored) so
`clear_dummy_data.py` can remove exactly this data later without touching
anything created manually. Owner and admin accounts are treated as
permanent dev fixtures and are not removed by the clear script.

Usage (from backend/):
    uv run python scripts/seed_dummy_data.py
    uv run python scripts/clear_dummy_data.py
"""

import asyncio
import json
import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.database.session import SessionFactory
from app.modules.admin.model import AuditLog
from app.modules.arena.model import (
    Amenity,
    Arena,
    ArenaBankDetails,
    ArenaBlockedDate,
    ArenaLike,
    ArenaStatus,
    DiscountCode,
    DiscountType,
    arena_amenities,
)
from app.modules.booking.model import Booking, BookingStatus, PaymentPlan, PaymentStatus
from app.modules.complaint.model import Complaint, ComplaintCategory, ComplaintStatus
from app.modules.court.model import Court, CourtPricingRule
from app.modules.equipment.model import BookingEquipment, Equipment
from app.modules.match.model import Match, MatchParticipant, MatchStatus
from app.modules.notification.model import Notification
from app.modules.payment.model import (
    Payment,
    PaymentLifecycleStatus,
    PaymentMethod,
    Refund,
    RefundStatus,
)
from app.modules.review.model import Review
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User, UserRole
from app.shared.pricing import resolve_peak_price

MANIFEST_PATH = Path(__file__).parent / ".seed_manifest.json"

OWNER_EMAIL = "owner@arenahub.pk"
OWNER_PHONE = "03001112233"
DEMO_PASSWORD = "Owner@1234"

ADMIN_EMAIL = "admin@arenahub.pk"
ADMIN_PHONE = "03000000000"
ADMIN_PASSWORD = "StrongP@ss1"

TODAY = date.today()


def _img(seed: str, w: int = 800, h: int = 600) -> str:
    """A stable, real, hosted placeholder photo — same seed always returns
    the same image, so re-running the script (pre-idempotency-skip) is
    deterministic. Used for non-court photos (receipts, avatars) where the
    subject matter doesn't matter."""
    return f"https://picsum.photos/seed/{seed}/{w}/{h}"


# Real, sport-specific Unsplash photos (verified hotlinkable) — courts and
# arenas get pictures of the actual sport they're used for rather than
# generic landscape placeholders. Several per sport so courts/arenas that
# share a sport still get visual variety instead of repeating one photo.
SPORT_PHOTO_IDS: dict[str, list[str]] = {
    "futsal": [
        "1774296245164-aae88288f893",  # illuminated futsal court at night
        "1701277050203-eabfa03e64eb",  # soccer field with goal
        "1521217078329-f8fc1becab68",  # aerial soccer field
        "1774798153992-b65a06c319db",  # players on indoor soccer court
        "1774798154084-c2b861d8581d",  # indoor soccer field, players
    ],
    "cricket": [
        "1674986778924-7a33c1531443",  # cricket field with bat and ball
        "1759733841123-b8e1d75ee45c",  # cricket stumps on grassy field
        "1743612135641-f56d3e1e03c0",  # cricket field under blue sky
        "1663832886113-3d55ed62d1ca",  # Melbourne Cricket Ground
        "1730739463889-34c7279277a9",  # filled cricket stadium
    ],
    "padel": [
        "1689942963385-f5bd03f3b270",  # blue padel/tennis court
        "1709587825415-814c2d7cfce7",  # court with net
        "1658723826297-fe4d1b1e6600",  # rackets and balls on court
    ],
    "badminton": [
        "1708312604109-16c0be9326cd",  # badminton racket and shuttles
        "1559309106-ed14040fd35d",  # pair of red badminton rackets
        "1564769353575-73f33a36d84f",  # empty indoor sports hall
        "1547934045-2942d193cb49",  # gray and white game court
    ],
    "tennis": [
        "1499510318569-1a3d67dc3976",  # aerial tennis court
        "1545151414-8a948e1ea54f",  # tennis court from above, player
        "1558365849-6ebd8b0454b2",  # tennis ball on court
    ],
}

# Cycles through a sport's photo pool so repeated calls (multiple courts of
# the same sport) don't all get the identical picture.
_sport_photo_cursor: dict[str, int] = {}


def _sport_photo(sport: str, w: int = 800, h: int = 600) -> str:
    pool = SPORT_PHOTO_IDS.get(sport, SPORT_PHOTO_IDS["futsal"])
    i = _sport_photo_cursor.get(sport, 0)
    _sport_photo_cursor[sport] = i + 1
    photo_id = pool[i % len(pool)]
    return f"https://images.unsplash.com/photo-{photo_id}?w={w}&h={h}&q=80&auto=format&fit=crop"


def _court_images(sport_types: list[str]) -> list[str]:
    primary = sport_types[0] if sport_types else "futsal"
    return [_sport_photo(primary), _sport_photo(primary)]


def _arena_images(sports: list[str]) -> list[str]:
    return [_sport_photo(sport) for sport in sports[:3]] or [_sport_photo("futsal")]


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

# Second owner: Ali Raza — two arenas, both in Multan.
ALI_ARENAS = [
    (
        "Multan Sports Complex",
        "Multan",
        "Cantt",
        Decimal("30.1978"),
        Decimal("71.4697"),
        ArenaStatus.approved,
        True,
        ["futsal", "cricket"],
        [
            ("Football Court 1", ["futsal"], 10, Decimal("2200.00"), True),
            ("Football Court 2", ["futsal"], 10, Decimal("2200.00"), True),
            ("Cricket Ground", ["cricket"], 22, Decimal("3500.00"), True),
        ],
    ),
    (
        "Multan Football Arena",
        "Multan",
        "Model Town",
        Decimal("30.1575"),
        Decimal("71.5249"),
        ArenaStatus.pending,
        True,
        ["futsal"],
        [
            ("Football Court 1", ["futsal"], 10, Decimal("2000.00"), True),
            ("Football Court 2", ["futsal"], 10, Decimal("2000.00"), True),
        ],
    ),
]

# Third owner: Ahmed Sheikh — two arenas, both in Lahore.
AHMED_ARENAS = [
    (
        "Lahore Arena",
        "Lahore",
        "Model Town",
        Decimal("31.4805"),
        Decimal("74.3283"),
        ArenaStatus.approved,
        True,
        ["badminton", "tennis"],
        [
            ("Badminton Court A", ["badminton"], 4, Decimal("1500.00"), True),
            ("Badminton Court B", ["badminton"], 4, Decimal("1500.00"), True),
            ("Tennis Court", ["tennis"], 4, Decimal("2500.00"), True),
        ],
    ),
    (
        "DHA Sports Club",
        "Lahore",
        "DHA Phase 6",
        Decimal("31.4741"),
        Decimal("74.4235"),
        ArenaStatus.approved,
        True,
        ["cricket", "futsal"],
        [
            ("Cricket Ground", ["cricket"], 22, Decimal("3200.00"), True),
            ("Football Court 1", ["futsal"], 10, Decimal("2600.00"), True),
        ],
    ),
]

# Fourth owner: Usman Farooq — one approved arena plus one still awaiting
# admin review, so the admin verification queue always has something in it.
USMAN_ARENAS = [
    (
        "Karachi Indoor Arena",
        "Karachi",
        "Gulshan-e-Iqbal",
        Decimal("24.9200"),
        Decimal("67.0947"),
        ArenaStatus.approved,
        True,
        ["badminton", "tennis", "futsal"],
        [
            ("Badminton Court A", ["badminton"], 4, Decimal("1600.00"), True),
            ("Tennis Court", ["tennis"], 4, Decimal("2600.00"), True),
            ("Football Court 1", ["futsal"], 10, Decimal("2700.00"), True),
        ],
    ),
    (
        "Karachi Padel Club",
        "Karachi",
        "DHA Phase 8",
        Decimal("24.8020"),
        Decimal("67.0660"),
        ArenaStatus.pending,
        True,
        ["padel"],
        [
            ("Padel Court 1", ["padel"], 4, Decimal("3200.00"), True),
            ("Padel Court 2", ["padel"], 4, Decimal("3200.00"), True),
        ],
    ),
]

# Fifth owner: Bilal Chaudhry — one approved arena plus one pending, same
# reasoning as Usman's second arena above.
BILAL_ARENAS = [
    (
        "Islamabad Sports Center",
        "Islamabad",
        "F-7",
        Decimal("33.7180"),
        Decimal("73.0563"),
        ArenaStatus.approved,
        True,
        ["futsal", "cricket", "badminton"],
        [
            ("Football Court 1", ["futsal"], 10, Decimal("2800.00"), True),
            ("Cricket Ground", ["cricket"], 22, Decimal("3600.00"), True),
            ("Badminton Court A", ["badminton"], 4, Decimal("1700.00"), True),
        ],
    ),
    (
        "Islamabad Cricket Hub",
        "Islamabad",
        "G-13",
        Decimal("33.6520"),
        Decimal("72.9746"),
        ArenaStatus.pending,
        True,
        ["cricket"],
        [
            ("Cricket Ground", ["cricket"], 22, Decimal("3400.00"), True),
        ],
    ),
]

# Every owner account this script seeds — email/password/arenas. The first
# entry is the original demo owner (kept exactly as-is for backward
# compatibility with already-documented credentials); the rest exist purely
# to demonstrate multi-owner, multi-city support for the FYP demo.
OWNERS: list[dict[str, Any]] = [
    {
        "full_name": "Demo Owner",
        "email": OWNER_EMAIL,
        "phone": OWNER_PHONE,
        "password": DEMO_PASSWORD,
        "arenas": ARENAS,
    },
    {
        "full_name": "Ali Raza",
        "email": "ali.owner@arenahub.pk",
        "phone": "03071112233",
        "password": DEMO_PASSWORD,
        "arenas": ALI_ARENAS,
    },
    {
        "full_name": "Ahmed Sheikh",
        "email": "ahmed.owner@arenahub.pk",
        "phone": "03081112233",
        "password": DEMO_PASSWORD,
        "arenas": AHMED_ARENAS,
    },
    {
        "full_name": "Usman Farooq",
        "email": "usman.owner@arenahub.pk",
        "phone": "03091112233",
        "password": DEMO_PASSWORD,
        "arenas": USMAN_ARENAS,
    },
    {
        "full_name": "Bilal Chaudhry",
        "email": "bilal.owner@arenahub.pk",
        "phone": "03101112233",
        "password": DEMO_PASSWORD,
        "arenas": BILAL_ARENAS,
    },
]

AMENITIES = [
    ("Parking", "car"),
    ("Floodlights", "lightbulb"),
    ("Washrooms", "shower"),
    ("Drinking Water", "droplet"),
    ("Cafeteria", "coffee"),
    ("First Aid", "cross"),
    ("Changing Rooms", "shirt"),
    ("WiFi", "wifi"),
]
# arena name -> amenity names
ARENA_AMENITIES = {
    "Arena Hub DHA Lahore": ["Parking", "Floodlights", "Washrooms", "Cafeteria", "WiFi"],
    "Arena Hub Gulberg Lahore": ["Parking", "Floodlights", "Drinking Water", "Changing Rooms"],
    "Arena Hub Clifton Karachi": ["Parking", "Washrooms"],
    "Arena Hub Bahria Town Lahore": ["Parking", "Floodlights", "First Aid"],
    "Arena Hub Johar Town Lahore": ["Drinking Water"],
    "Multan Sports Complex": ["Parking", "Floodlights", "Washrooms"],
    "Multan Football Arena": ["Parking", "Drinking Water"],
    "Lahore Arena": ["Parking", "Changing Rooms", "WiFi"],
    "DHA Sports Club": ["Parking", "Floodlights", "Cafeteria"],
    "Karachi Indoor Arena": ["Parking", "Washrooms", "WiFi"],
    "Karachi Padel Club": ["Parking", "Changing Rooms", "Drinking Water"],
    "Islamabad Sports Center": ["Parking", "Floodlights", "First Aid", "Cafeteria"],
    "Islamabad Cricket Hub": ["Parking", "Floodlights", "Washrooms"],
}

REJECTION_REASON = "Photos are too blurry — please re-upload clear, well-lit court photos."

# (full_name, email, phone, bio, preferred_sports, preferred_locations)
PLAYERS = [
    (
        "Ahmed Raza",
        "ahmed.raza@example.com",
        "03011234567",
        "Weekend futsal regular, always looking for a 5-a-side game.",
        ["futsal"],
        ["Lahore"],
    ),
    (
        "Sara Khan",
        "sara.khan@example.com",
        "03021234567",
        "Cricket enthusiast, plays with a corporate league on weekends.",
        ["cricket"],
        ["Lahore", "Karachi"],
    ),
    (
        "Bilal Ahmed",
        "bilal.ahmed@example.com",
        "03031234567",
        "Padel newbie, trying to play twice a week.",
        ["padel"],
        ["Lahore"],
    ),
    (
        "Hina Malik",
        "hina.malik@example.com",
        "03041234567",
        None,
        ["futsal", "padel"],
        ["Lahore"],
    ),
    (
        "Usman Tariq",
        "usman.tariq@example.com",
        "03051234567",
        "Books courts for the office five-a-side team.",
        ["futsal", "cricket"],
        ["Lahore"],
    ),
    (
        "Ayesha Siddiqui",
        "ayesha.siddiqui@example.com",
        "03061234567",
        "Karachi-based, plays cricket whenever work allows.",
        ["cricket"],
        ["Karachi"],
    ),
    (
        "Kamran Malik",
        "kamran.malik@example.com",
        "03072234567",
        "Plays five-a-side every Friday in Multan.",
        ["futsal"],
        ["Multan"],
    ),
    (
        "Sadia Yousuf",
        "sadia.yousuf@example.com",
        "03082234567",
        "Cricket allrounder, weekend league player.",
        ["cricket"],
        ["Multan"],
    ),
    (
        "Fahad Iqbal",
        "fahad.iqbal@example.com",
        "03092234567",
        "Badminton club member, plays twice a week.",
        ["badminton"],
        ["Lahore"],
    ),
    (
        "Mehwish Anwar",
        "mehwish.anwar@example.com",
        "03102234567",
        None,
        ["tennis", "badminton"],
        ["Lahore"],
    ),
    (
        "Junaid Khalid",
        "junaid.khalid@example.com",
        "03112234567",
        "Tennis player, training for a local tournament.",
        ["tennis"],
        ["Karachi"],
    ),
    (
        "Sana Riaz",
        "sana.riaz@example.com",
        "03122234567",
        "Plays badminton with colleagues after work.",
        ["badminton"],
        ["Karachi"],
    ),
    (
        "Waqas Ahmed",
        "waqas.ahmed@example.com",
        "03132234567",
        "Cricket fan, books the ground for weekend matches.",
        ["cricket", "futsal"],
        ["Islamabad"],
    ),
    (
        "Iqra Noor",
        "iqra.noor@example.com",
        "03142234567",
        "New to badminton, plays casually.",
        ["badminton"],
        ["Islamabad"],
    ),
    (
        "Hamza Sheikh",
        "hamza.sheikh@example.com",
        "03152234567",
        "Plays futsal and cricket around F-7, Islamabad.",
        ["futsal", "cricket"],
        ["Islamabad"],
    ),
]
PLAYER_PASSWORD = "Player@1234"

# arena name -> [(name, description, rental_price, qty_total, qty_available, is_active)]
EQUIPMENT = {
    "Arena Hub DHA Lahore": [
        ("Football", "Standard size 5 match football", Decimal("200.00"), 10, 8, True),
        (
            "Bibs (Set of 10)",
            "Coloured training bibs for team scrimmage",
            Decimal("300.00"),
            5,
            5,
            True,
        ),
        ("Cricket Kit", "Bat, pads, gloves, and helmet", Decimal("500.00"), 4, 3, True),
        (
            "Floodlight Extension",
            "Extra portable floodlight for late games",
            Decimal("150.00"),
            2,
            0,
            False,
        ),
    ],
    "Arena Hub Gulberg Lahore": [
        ("Football", "Standard size 5 match football", Decimal("200.00"), 8, 6, True),
        ("Padel Racket", "Carbon-fibre padel racket, per pair", Decimal("400.00"), 6, 5, True),
        ("First Aid Kit", "On-court injury kit", Decimal("50.00"), 2, 2, True),
    ],
}

# Equipment for the second-wave (multi-owner) arenas — kept separate from
# EQUIPMENT since it's created by `_seed_player_flow_v2`, gated by its own
# "flow_seeded_v2" manifest flag.
EQUIPMENT_V2 = {
    "Lahore Arena": [
        ("Badminton Racket", "Carbon-shaft racket, per pair", Decimal("250.00"), 8, 6, True),
        ("Shuttlecocks (Tube of 6)", "Feather shuttlecocks", Decimal("150.00"), 10, 9, True),
    ],
    "Karachi Indoor Arena": [
        ("Tennis Racket", "Standard tennis racket, per pair", Decimal("350.00"), 6, 5, True),
        ("Tennis Balls (Tube of 3)", "Practice tennis balls", Decimal("200.00"), 8, 8, True),
    ],
}

_WEEKDAY_NAMES = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


async def _get_or_create_owner(
    db: AsyncSession, *, full_name: str, email: str, phone: str, password: str
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        full_name=full_name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=UserRole.owner,
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    print(f"created: owner account ({email})")
    return user


async def _get_or_create_admin(db: AsyncSession) -> User:
    """Admins never self-register (docs/PROJECT_GUIDELINES.md) — this is the
    only place an admin account gets created, for local dev/demo."""
    result = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        full_name="Platform Admin",
        email=ADMIN_EMAIL,
        phone=ADMIN_PHONE,
        password_hash=hash_password(ADMIN_PASSWORD),
        role=UserRole.admin,
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    print(f"created: admin account ({ADMIN_EMAIL})")
    return user


async def _get_or_create_amenities(db: AsyncSession) -> dict[str, Amenity]:
    result = await db.execute(select(Amenity))
    by_name = {a.name: a for a in result.scalars().all()}
    for name, icon in AMENITIES:
        if name not in by_name:
            amenity = Amenity(name=name, icon=icon)
            db.add(amenity)
            by_name[name] = amenity
    await db.flush()
    return by_name


async def _seed_arenas(
    db: AsyncSession, owner: User, arenas_list: list, manifest: dict
) -> dict[str, Arena]:
    """Create arenas/courts/pricing/discount/blocked-date for one owner's
    ``arenas_list``. Returns arena name -> Arena for every arena that now
    exists (freshly created or pre-existing), so the player-flow section can
    book against them."""
    amenities_by_name = await _get_or_create_amenities(db)

    existing = await db.execute(select(Arena).where(Arena.owner_id == owner.id))
    arenas_by_name = {a.name: a for a in existing.scalars().all()}

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
    ) in arenas_list:
        if name in arenas_by_name:
            arena = arenas_by_name[name]
            updated = False
            # Always re-derive from the sport-specific pool — replaces any
            # stale generic/landscape placeholders from earlier seed runs.
            new_arena_images = _arena_images(sports)
            if arena.images != new_arena_images:
                arena.images = new_arena_images
                updated = True
            has_amenities = (
                await db.execute(
                    select(arena_amenities.c.arena_id).where(arena_amenities.c.arena_id == arena.id)
                )
            ).first()
            if not has_amenities and ARENA_AMENITIES.get(name):
                for amenity_name in ARENA_AMENITIES[name]:
                    await db.execute(
                        arena_amenities.insert().values(
                            arena_id=arena.id, amenity_id=amenities_by_name[amenity_name].id
                        )
                    )
                updated = True
            existing_courts = (
                (await db.execute(select(Court).where(Court.arena_id == arena.id))).scalars().all()
            )
            courts_by_name = {c.name: c for c in existing_courts}
            for court_name, sport_types, _capacity, _base_price, _is_available in courts:
                court = courts_by_name.get(court_name)
                if court is not None:
                    new_court_images = _court_images(sport_types)
                    if court.images != new_court_images:
                        court.images = new_court_images
                        updated = True
            print(
                f"skip (already exists): {name}"
                + (" — refreshed sport photos/amenities" if updated else "")
            )
            # Still record it: the manifest is rewritten on every run, so a
            # skipped arena would otherwise vanish from it and the clear
            # script could never remove it again.
            manifest["arenas"].append(
                {
                    "id": str(arena.id),
                    "name": name,
                    "court_ids": [str(c.id) for c in existing_courts],
                }
            )
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
            images=_arena_images(sports),
            status=status,
            rejection_reason=REJECTION_REASON if status == ArenaStatus.rejected else None,
            advance_percentage=50,
            require_full_payment=False,
            refund_policy=[
                {"hours_before": 24, "refund_percentage": 100},
                {"hours_before": 6, "refund_percentage": 50},
            ],
            is_active=is_active,
            amenities=[amenities_by_name[n] for n in ARENA_AMENITIES.get(name, [])],
        )
        db.add(arena)
        await db.flush()
        arenas_by_name[name] = arena
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
                images=_court_images(sport_types),
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

    return arenas_by_name


async def _get_or_create_players(db: AsyncSession) -> list[User]:
    players = []
    for full_name, email, phone, bio, sports, locations in PLAYERS:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                full_name=full_name,
                email=email,
                phone=phone,
                password_hash=hash_password(PLAYER_PASSWORD),
                role=UserRole.player,
                is_verified=True,
                is_active=True,
                bio=bio,
                preferred_sports=sports,
                preferred_locations=locations,
                profile_picture=_img(f"player-{email}", 200, 200),
            )
            db.add(user)
        players.append(user)
    await db.flush()
    return players


def _slots_for_day(open_time: time, close_time: time) -> list[time]:
    starts = []
    cursor = datetime.combine(date.min, open_time)
    end = datetime.combine(date.min, close_time)
    while cursor + timedelta(hours=1) <= end:
        starts.append(cursor.time())
        cursor += timedelta(hours=1)
    return starts


async def _generate_slots_for_court(
    db: AsyncSession,
    court: Court,
    pricing_rules: Sequence[CourtPricingRule],
    days_back: int,
    days_fwd: int,
) -> dict[tuple, TimeSlot]:
    """Generate one week back through two weeks forward of hourly slots for a
    court, mirroring the real slot-generation service. Returns a lookup of
    (date, start_time) -> TimeSlot for the booking step to pick from.

    Idempotent: slots already in the DB (from an earlier seed run against
    surviving arenas, or generated by the app itself) are reused, not
    re-inserted — the unique (court, date, start) constraint would reject
    duplicates."""
    cursor = TODAY - timedelta(days=days_back)
    last = TODAY + timedelta(days=days_fwd)
    existing = (
        (
            await db.execute(
                select(TimeSlot).where(
                    TimeSlot.court_id == court.id,
                    TimeSlot.date >= cursor,
                    TimeSlot.date <= last,
                )
            )
        )
        .scalars()
        .all()
    )
    by_key: dict[tuple, TimeSlot] = {(s.date, s.start_time): s for s in existing}
    while cursor <= last:
        day_name = _WEEKDAY_NAMES[cursor.weekday()]
        hours = _HOURS.get(day_name)
        if hours:
            open_time = datetime.strptime(hours["open"], "%H:%M").time()
            close_time = datetime.strptime(hours["close"], "%H:%M").time()
            for start in _slots_for_day(open_time, close_time):
                if (cursor, start) in by_key:
                    continue
                end = (datetime.combine(date.min, start) + timedelta(hours=1)).time()
                price = resolve_peak_price(
                    court.base_price, pricing_rules, cursor.isoweekday(), start
                )
                slot = TimeSlot(
                    court_id=court.id,
                    date=cursor,
                    start_time=start,
                    end_time=end,
                    status=SlotStatus.available,
                    price=price,
                )
                db.add(slot)
                by_key[(cursor, start)] = slot
        cursor += timedelta(days=1)
    await db.flush()
    return by_key


def _booking_group_id() -> uuid.UUID:
    return uuid.uuid4()


def _make_booking(
    db: AsyncSession,
    *,
    player: User,
    arena: Arena,
    court: Court,
    slot: TimeSlot,
    status: BookingStatus,
    payment_type: PaymentPlan,
    payment_status: PaymentStatus,
    slot_status: SlotStatus,
    cancellation_reason: str | None = None,
    refund_eligible: bool = False,
    refund_percentage: int | None = None,
) -> tuple[Booking, uuid.UUID]:
    group_id = _booking_group_id()
    total = slot.price
    if payment_type == PaymentPlan.advance:
        advance = (total * Decimal("0.5")).quantize(Decimal("0.01"))
        remaining = total - advance
    else:
        advance = total
        remaining = Decimal("0")
    booking = Booking(
        player_id=player.id,
        arena_id=arena.id,
        court_id=court.id,
        slot_id=slot.id,
        booking_group_id=group_id,
        booking_date=slot.date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        total_amount=total,
        advance_amount=advance,
        remaining_amount=remaining,
        payment_type=payment_type,
        status=status,
        payment_status=payment_status,
        cancellation_reason=cancellation_reason,
        refund_eligible=refund_eligible,
        refund_percentage=refund_percentage,
    )
    slot.status = slot_status
    db.add(booking)
    return booking, group_id


async def _seed_player_flow(
    db: AsyncSession, arenas_by_name: dict[str, Arena], manifest: dict
) -> None:
    dha = arenas_by_name["Arena Hub DHA Lahore"]
    gulberg = arenas_by_name["Arena Hub Gulberg Lahore"]

    players = await _get_or_create_players(db)
    if len(players) < 6:
        raise RuntimeError("Expected at least 6 seeded players for the demo flow.")
    # PLAYERS has grown well past 6 entries; this flow only names the first
    # six (the rest exist for the v2 multi-owner flow / general search data).
    ahmed, sara, bilal, hina, usman, ayesha = players[:6]

    dha_courts = (await db.execute(select(Court).where(Court.arena_id == dha.id))).scalars().all()
    gulberg_courts = (
        (await db.execute(select(Court).where(Court.arena_id == gulberg.id))).scalars().all()
    )
    dha_courts_by_name = {c.name: c for c in dha_courts}
    gulberg_courts_by_name = {c.name: c for c in gulberg_courts}

    dha_pricing = (
        (
            await db.execute(
                select(CourtPricingRule).where(
                    CourtPricingRule.court_id == dha_courts_by_name["Court 1"].id
                )
            )
        )
        .scalars()
        .all()
    )
    gulberg_pricing = (
        (
            await db.execute(
                select(CourtPricingRule).where(
                    CourtPricingRule.court_id == gulberg_courts_by_name["Court 1"].id
                )
            )
        )
        .scalars()
        .all()
    )

    slots_by_court: dict[str, dict[tuple, TimeSlot]] = {}
    for court in dha_courts:
        rules = dha_pricing if court.name == "Court 1" else []
        slots_by_court[str(court.id)] = await _generate_slots_for_court(
            db, court, rules, days_back=10, days_fwd=14
        )
    for court in gulberg_courts:
        rules = gulberg_pricing if court.name == "Court 1" else []
        slots_by_court[str(court.id)] = await _generate_slots_for_court(
            db, court, rules, days_back=10, days_fwd=14
        )

    equipment_by_arena: dict[str, list[Equipment]] = {}
    for arena_name, items in EQUIPMENT.items():
        arena = arenas_by_name[arena_name]
        rows = []
        for eq_name, desc, price, qty_total, qty_avail, is_active in items:
            eq = Equipment(
                arena_id=arena.id,
                name=eq_name,
                description=desc,
                rental_price=price,
                quantity_total=qty_total,
                quantity_available=qty_avail,
                is_active=is_active,
            )
            db.add(eq)
            rows.append(eq)
        equipment_by_arena[arena_name] = rows
    await db.flush()

    def slot_at(court: Court, day_offset: int, hour: int) -> TimeSlot:
        d = TODAY + timedelta(days=day_offset)
        return slots_by_court[str(court.id)][(d, time(hour, 0))]

    booking_ids: list[str] = []
    payment_ids: list[str] = []
    equipment_ids: list[str] = [str(e.id) for rows in equipment_by_arena.values() for e in rows]
    review_ids: list[str] = []

    def make_booking(**kwargs: Any) -> tuple[Booking, uuid.UUID]:
        return _make_booking(db, **kwargs)

    # 1. Completed, full payment, card, reviewed with owner response.
    slot = slot_at(dha_courts_by_name["Court 1"], -7, 19)
    b1, g1 = make_booking(
        player=ahmed,
        arena=dha,
        court=dha_courts_by_name["Court 1"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p1 = Payment(
        booking_group_id=g1,
        player_id=ahmed.id,
        amount=b1.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p1)
    await db.flush()
    r1 = Review(
        player_id=ahmed.id,
        arena_id=dha.id,
        booking_id=b1.id,
        rating=5,
        review_text="Great futsal court, well maintained turf and friendly staff.",
        owner_response="Thanks for the kind words, Ahmed! See you next week.",
        owner_response_at=datetime.now(),
    )
    db.add(r1)

    # 2. Completed, bank_transfer, cricket kit rented, flagged review.
    slot = slot_at(dha_courts_by_name["Court 3"], -5, 17)
    b2, g2 = make_booking(
        player=sara,
        arena=dha,
        court=dha_courts_by_name["Court 3"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p2 = Payment(
        booking_group_id=g2,
        player_id=sara.id,
        amount=b2.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.bank_transfer,
        payment_provider="manual",
        receipt_proof_url=_img("receipt-sara", 600, 800),
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p2)
    cricket_kit = next(
        e for e in equipment_by_arena["Arena Hub DHA Lahore"] if e.name == "Cricket Kit"
    )
    db.add(
        BookingEquipment(
            booking_id=b2.id,
            equipment_id=cricket_kit.id,
            quantity=1,
            total_price=cricket_kit.rental_price,
        )
    )
    await db.flush()
    r2 = Review(
        player_id=sara.id,
        arena_id=dha.id,
        booking_id=b2.id,
        rating=2,
        review_text="Cricket kit gloves were torn and the pitch had puddles.",
        is_flagged=True,
        flag_reason="Player disputes court condition — owner requested review.",
        flagged_by=None,
        flagged_at=datetime.now(),
    )
    db.add(r2)

    # 3. Completed, easypaisa, padel, plain unrated-response review.
    slot = slot_at(dha_courts_by_name["Court 4"], -3, 20)
    b3, g3 = make_booking(
        player=bilal,
        arena=dha,
        court=dha_courts_by_name["Court 4"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p3 = Payment(
        booking_group_id=g3,
        player_id=bilal.id,
        amount=b3.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.easypaisa,
        payment_provider="easypaisa",
        gateway_transaction_id=f"ep_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p3)
    await db.flush()
    r3 = Review(
        player_id=bilal.id,
        arena_id=dha.id,
        booking_id=b3.id,
        rating=4,
        review_text="Good padel court, would book again.",
    )
    db.add(r3)

    # 4. Confirmed (future), jazzcash, advance payment plan — no review yet.
    slot = slot_at(gulberg_courts_by_name["Court 1"], 3, 18)
    b4, g4 = make_booking(
        player=hina,
        arena=gulberg,
        court=gulberg_courts_by_name["Court 1"],
        slot=slot,
        status=BookingStatus.confirmed,
        payment_type=PaymentPlan.advance,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p4 = Payment(
        booking_group_id=g4,
        player_id=hina.id,
        amount=b4.advance_amount,
        currency="PKR",
        payment_method=PaymentMethod.jazzcash,
        payment_provider="jazzcash",
        gateway_transaction_id=f"jc_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.advance,
    )
    db.add(p4)
    football = next(
        e for e in equipment_by_arena["Arena Hub Gulberg Lahore"] if e.name == "Football"
    )
    db.add(
        BookingEquipment(
            booking_id=b4.id,
            equipment_id=football.id,
            quantity=2,
            total_price=football.rental_price * 2,
        )
    )

    # 5. Confirmed (future), card, full payment, second court/arena for variety.
    slot = slot_at(dha_courts_by_name["Court 2"], 2, 21)
    b5, g5 = make_booking(
        player=usman,
        arena=dha,
        court=dha_courts_by_name["Court 2"],
        slot=slot,
        status=BookingStatus.confirmed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p5 = Payment(
        booking_group_id=g5,
        player_id=usman.id,
        amount=b5.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p5)

    # 6. Pending payment (player mid-checkout, no payment row yet).
    slot = slot_at(gulberg_courts_by_name["Court 2"], 4, 16)
    b6, g6 = make_booking(
        player=ayesha,
        arena=gulberg,
        court=gulberg_courts_by_name["Court 2"],
        slot=slot,
        status=BookingStatus.pending_payment,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.pending,
        slot_status=SlotStatus.reserved,
    )

    # 7. Pending approval — bank transfer receipt submitted, owner hasn't reviewed yet.
    slot = slot_at(dha_courts_by_name["Court 1"], 5, 20)
    b7, g7 = make_booking(
        player=ahmed,
        arena=dha,
        court=dha_courts_by_name["Court 1"],
        slot=slot,
        status=BookingStatus.pending_approval,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.pending,
        slot_status=SlotStatus.reserved,
    )
    await db.flush()
    p7 = Payment(
        booking_group_id=g7,
        player_id=ahmed.id,
        amount=b7.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.bank_transfer,
        payment_provider="manual",
        receipt_proof_url=_img("receipt-ahmed", 600, 800),
        status=PaymentStatus.pending,
        payment_type=PaymentPlan.full,
    )
    db.add(p7)

    # 8. Rejected — owner rejected the bank-transfer receipt (blurry/invalid).
    slot = slot_at(gulberg_courts_by_name["Court 1"], 6, 19)
    b8, g8 = make_booking(
        player=sara,
        arena=gulberg,
        court=gulberg_courts_by_name["Court 1"],
        slot=slot,
        status=BookingStatus.rejected,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.failed,
        slot_status=SlotStatus.available,
        cancellation_reason="Receipt image did not match the booking amount.",
    )
    await db.flush()
    p8 = Payment(
        booking_group_id=g8,
        player_id=sara.id,
        amount=b8.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.bank_transfer,
        payment_provider="manual",
        receipt_proof_url=_img("receipt-sara-2", 600, 800),
        status=PaymentStatus.failed,
        payment_type=PaymentPlan.full,
    )
    db.add(p8)

    # 9. Cancelled by player, refund fully processed.
    slot = slot_at(dha_courts_by_name["Court 2"], -2, 9)
    b9, g9 = make_booking(
        player=bilal,
        arena=dha,
        court=dha_courts_by_name["Court 2"],
        slot=slot,
        status=BookingStatus.cancelled,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.refunded,
        slot_status=SlotStatus.available,
        cancellation_reason="Player rescheduled to a different week.",
        refund_eligible=True,
        refund_percentage=100,
    )
    await db.flush()
    p9 = Payment(
        booking_group_id=g9,
        player_id=bilal.id,
        amount=b9.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.refunded,
        payment_type=PaymentPlan.full,
    )
    db.add(p9)
    await db.flush()
    ref9 = Refund(
        booking_id=b9.id,
        payment_id=p9.id,
        amount=b9.total_amount,
        reason="Cancelled more than 24 hours before start — full refund per policy.",
        status=RefundStatus.processed,
        processed_at=datetime.now(),
    )
    db.add(ref9)

    # 10. Cancelled late, partial refund still pending.
    slot = slot_at(gulberg_courts_by_name["Court 2"], -1, 8)
    b10, g10 = make_booking(
        player=hina,
        arena=gulberg,
        court=gulberg_courts_by_name["Court 2"],
        slot=slot,
        status=BookingStatus.cancelled,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.available,
        cancellation_reason="Player cancelled a few hours before start.",
        refund_eligible=True,
        refund_percentage=50,
    )
    await db.flush()
    p10 = Payment(
        booking_group_id=g10,
        player_id=hina.id,
        amount=b10.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.easypaisa,
        payment_provider="easypaisa",
        gateway_transaction_id=f"ep_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p10)
    await db.flush()
    ref10 = Refund(
        booking_id=b10.id,
        payment_id=p10.id,
        amount=(b10.total_amount * Decimal("0.5")).quantize(Decimal("0.01")),
        reason="Cancelled inside the 6-hour window — 50% refund per policy.",
        status=RefundStatus.pending,
    )
    db.add(ref10)

    # 11. Failed payment — card declined, booking stays pending_payment.
    slot = slot_at(dha_courts_by_name["Court 4"], 1, 22)
    b11, g11 = make_booking(
        player=usman,
        arena=dha,
        court=dha_courts_by_name["Court 4"],
        slot=slot,
        status=BookingStatus.pending_payment,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.failed,
        slot_status=SlotStatus.reserved,
    )
    await db.flush()
    p11 = Payment(
        booking_group_id=g11,
        player_id=usman.id,
        amount=b11.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.failed,
        payment_type=PaymentPlan.full,
    )
    db.add(p11)

    # 12. Completed, another arena's court, no review left yet (shows the
    # "awaiting review" case on the player side / no-review case on owner side).
    slot = slot_at(gulberg_courts_by_name["Court 1"], -6, 7)
    b12, g12 = make_booking(
        player=ayesha,
        arena=gulberg,
        court=gulberg_courts_by_name["Court 1"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    p12 = Payment(
        booking_group_id=g12,
        player_id=ayesha.id,
        amount=b12.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p12)

    await db.flush()

    for b, g in [
        (b1, g1),
        (b2, g2),
        (b3, g3),
        (b4, g4),
        (b5, g5),
        (b6, g6),
        (b7, g7),
        (b8, g8),
        (b9, g9),
        (b10, g10),
        (b11, g11),
        (b12, g12),
    ]:
        booking_ids.append(str(b.id))
        payment_ids.append(str(g))
    for r in [r1, r2, r3]:
        review_ids.append(str(r.id))

    manifest["players"] = [str(p.id) for p in players]
    manifest["bookings"] = booking_ids
    manifest["payment_booking_groups"] = payment_ids
    manifest["equipment"] = equipment_ids
    manifest["reviews"] = review_ids
    manifest["flow_seeded"] = True
    print(
        f"created: {len(players)} players, 12 bookings across every status, "
        "3 reviews, equipment + refunds"
    )


_V2_NEW_ARENA_NAMES = [
    "Multan Sports Complex",
    "Multan Football Arena",
    "Lahore Arena",
    "DHA Sports Club",
    "Karachi Indoor Arena",
    "Islamabad Sports Center",
]


async def _seed_player_flow_v2(
    db: AsyncSession, arenas_by_name: dict[str, Arena], manifest: dict
) -> None:
    """Bookings/payments/reviews for the second-wave multi-owner arenas
    (Multan/Lahore/Karachi/Islamabad) — gives each new owner's dashboard
    real booking history too, not just an empty arena/court shell."""
    players = await _get_or_create_players(db)
    players_by_email = {p.email: p for p in players}
    kamran = players_by_email["kamran.malik@example.com"]
    sadia = players_by_email["sadia.yousuf@example.com"]
    fahad = players_by_email["fahad.iqbal@example.com"]
    mehwish = players_by_email["mehwish.anwar@example.com"]
    junaid = players_by_email["junaid.khalid@example.com"]
    sana = players_by_email["sana.riaz@example.com"]
    waqas = players_by_email["waqas.ahmed@example.com"]
    iqra = players_by_email["iqra.noor@example.com"]

    courts_by_arena: dict[str, dict[str, Court]] = {}
    slots_by_court: dict[str, dict[tuple, TimeSlot]] = {}
    for arena_name in _V2_NEW_ARENA_NAMES:
        arena = arenas_by_name[arena_name]
        courts = (await db.execute(select(Court).where(Court.arena_id == arena.id))).scalars().all()
        courts_by_arena[arena_name] = {c.name: c for c in courts}
        for court in courts:
            slots_by_court[str(court.id)] = await _generate_slots_for_court(
                db, court, [], days_back=10, days_fwd=14
            )

    equipment_by_arena: dict[str, list[Equipment]] = {}
    for arena_name, items in EQUIPMENT_V2.items():
        arena = arenas_by_name[arena_name]
        rows = []
        for eq_name, desc, price, qty_total, qty_avail, is_active in items:
            eq = Equipment(
                arena_id=arena.id,
                name=eq_name,
                description=desc,
                rental_price=price,
                quantity_total=qty_total,
                quantity_available=qty_avail,
                is_active=is_active,
            )
            db.add(eq)
            rows.append(eq)
        equipment_by_arena[arena_name] = rows
    await db.flush()

    def slot_at(arena_name: str, court_name: str, day_offset: int, hour: int) -> TimeSlot:
        court = courts_by_arena[arena_name][court_name]
        d = TODAY + timedelta(days=day_offset)
        return slots_by_court[str(court.id)][(d, time(hour, 0))]

    def make_booking(**kwargs: Any) -> tuple[Booking, uuid.UUID]:
        return _make_booking(db, **kwargs)

    booking_ids: list[str] = []
    payment_ids: list[str] = []
    review_ids: list[str] = []

    # -- Multan Sports Complex (Ali Raza) --------------------------------
    slot = slot_at("Multan Sports Complex", "Football Court 1", -6, 18)
    b1, g1 = make_booking(
        player=kamran,
        arena=arenas_by_name["Multan Sports Complex"],
        court=courts_by_arena["Multan Sports Complex"]["Football Court 1"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g1,
            player_id=kamran.id,
            amount=b1.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.card,
            payment_provider="stripe",
            gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )
    await db.flush()
    r1 = Review(
        player_id=kamran.id,
        arena_id=arenas_by_name["Multan Sports Complex"].id,
        booking_id=b1.id,
        rating=5,
        review_text="Best futsal setup in Multan, great turf.",
        owner_response="Thanks Kamran, see you next Friday!",
        owner_response_at=datetime.now(),
    )
    db.add(r1)
    review_ids.append(str(r1.id))

    slot = slot_at("Multan Sports Complex", "Cricket Ground", 3, 16)
    b2, g2 = make_booking(
        player=sadia,
        arena=arenas_by_name["Multan Sports Complex"],
        court=courts_by_arena["Multan Sports Complex"]["Cricket Ground"],
        slot=slot,
        status=BookingStatus.confirmed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g2,
            player_id=sadia.id,
            amount=b2.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.easypaisa,
            payment_provider="easypaisa",
            gateway_transaction_id=f"ep_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )

    # -- Multan Football Arena (Ali Raza, pending) -----------------------
    slot = slot_at("Multan Football Arena", "Football Court 1", 4, 19)
    b3, _ = make_booking(
        player=kamran,
        arena=arenas_by_name["Multan Football Arena"],
        court=courts_by_arena["Multan Football Arena"]["Football Court 1"],
        slot=slot,
        status=BookingStatus.pending_payment,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.pending,
        slot_status=SlotStatus.reserved,
    )

    slot = slot_at("Multan Football Arena", "Football Court 2", -1, 10)
    b4, g4 = make_booking(
        player=sadia,
        arena=arenas_by_name["Multan Football Arena"],
        court=courts_by_arena["Multan Football Arena"]["Football Court 2"],
        slot=slot,
        status=BookingStatus.cancelled,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.available,
        cancellation_reason="Player cancelled a few hours before start.",
        refund_eligible=True,
        refund_percentage=50,
    )
    await db.flush()
    p4 = Payment(
        booking_group_id=g4,
        player_id=sadia.id,
        amount=b4.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.jazzcash,
        payment_provider="jazzcash",
        gateway_transaction_id=f"jc_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.completed,
        payment_type=PaymentPlan.full,
    )
    db.add(p4)
    await db.flush()
    db.add(
        Refund(
            booking_id=b4.id,
            payment_id=p4.id,
            amount=(b4.total_amount * Decimal("0.5")).quantize(Decimal("0.01")),
            reason="Cancelled inside the 6-hour window — 50% refund per policy.",
            status=RefundStatus.pending,
        )
    )

    # -- Lahore Arena (Ahmed Sheikh) --------------------------------------
    slot = slot_at("Lahore Arena", "Badminton Court A", -4, 18)
    b5, g5 = make_booking(
        player=fahad,
        arena=arenas_by_name["Lahore Arena"],
        court=courts_by_arena["Lahore Arena"]["Badminton Court A"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g5,
            player_id=fahad.id,
            amount=b5.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.jazzcash,
            payment_provider="jazzcash",
            gateway_transaction_id=f"jc_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )
    racket = next(e for e in equipment_by_arena["Lahore Arena"] if e.name == "Badminton Racket")
    db.add(
        BookingEquipment(
            booking_id=b5.id,
            equipment_id=racket.id,
            quantity=2,
            total_price=racket.rental_price * 2,
        )
    )
    await db.flush()
    r5 = Review(
        player_id=fahad.id,
        arena_id=arenas_by_name["Lahore Arena"].id,
        booking_id=b5.id,
        rating=4,
        review_text="Good badminton court, rackets were decent quality.",
    )
    db.add(r5)
    review_ids.append(str(r5.id))

    slot = slot_at("Lahore Arena", "Tennis Court", 5, 17)
    b6, g6 = make_booking(
        player=mehwish,
        arena=arenas_by_name["Lahore Arena"],
        court=courts_by_arena["Lahore Arena"]["Tennis Court"],
        slot=slot,
        status=BookingStatus.pending_approval,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.pending,
        slot_status=SlotStatus.reserved,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g6,
            player_id=mehwish.id,
            amount=b6.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.bank_transfer,
            payment_provider="manual",
            receipt_proof_url=_img("receipt-mehwish", 600, 800),
            status=PaymentStatus.pending,
            payment_type=PaymentPlan.full,
        )
    )

    # -- DHA Sports Club (Ahmed Sheikh) ------------------------------------
    slot = slot_at("DHA Sports Club", "Cricket Ground", 2, 15)
    b7, g7 = make_booking(
        player=mehwish,
        arena=arenas_by_name["DHA Sports Club"],
        court=courts_by_arena["DHA Sports Club"]["Cricket Ground"],
        slot=slot,
        status=BookingStatus.confirmed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g7,
            player_id=mehwish.id,
            amount=b7.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.card,
            payment_provider="stripe",
            gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )

    slot = slot_at("DHA Sports Club", "Football Court 1", 6, 20)
    b8, g8 = make_booking(
        player=fahad,
        arena=arenas_by_name["DHA Sports Club"],
        court=courts_by_arena["DHA Sports Club"]["Football Court 1"],
        slot=slot,
        status=BookingStatus.rejected,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.failed,
        slot_status=SlotStatus.available,
        cancellation_reason="Receipt did not match the booked amount.",
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g8,
            player_id=fahad.id,
            amount=b8.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.bank_transfer,
            payment_provider="manual",
            receipt_proof_url=_img("receipt-fahad", 600, 800),
            status=PaymentStatus.failed,
            payment_type=PaymentPlan.full,
        )
    )

    # -- Karachi Indoor Arena (Usman Farooq) -------------------------------
    slot = slot_at("Karachi Indoor Arena", "Tennis Court", -3, 17)
    b9, g9 = make_booking(
        player=junaid,
        arena=arenas_by_name["Karachi Indoor Arena"],
        court=courts_by_arena["Karachi Indoor Arena"]["Tennis Court"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g9,
            player_id=junaid.id,
            amount=b9.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.easypaisa,
            payment_provider="easypaisa",
            gateway_transaction_id=f"ep_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )
    balls = next(
        e
        for e in equipment_by_arena["Karachi Indoor Arena"]
        if e.name == "Tennis Balls (Tube of 3)"
    )
    db.add(
        BookingEquipment(
            booking_id=b9.id,
            equipment_id=balls.id,
            quantity=1,
            total_price=balls.rental_price,
        )
    )
    await db.flush()
    r9 = Review(
        player_id=junaid.id,
        arena_id=arenas_by_name["Karachi Indoor Arena"].id,
        booking_id=b9.id,
        rating=5,
        review_text="Great indoor tennis court, well kept.",
    )
    db.add(r9)
    review_ids.append(str(r9.id))

    slot = slot_at("Karachi Indoor Arena", "Badminton Court A", -2, 9)
    b10, g10 = make_booking(
        player=sana,
        arena=arenas_by_name["Karachi Indoor Arena"],
        court=courts_by_arena["Karachi Indoor Arena"]["Badminton Court A"],
        slot=slot,
        status=BookingStatus.cancelled,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.refunded,
        slot_status=SlotStatus.available,
        cancellation_reason="Player rescheduled.",
        refund_eligible=True,
        refund_percentage=100,
    )
    await db.flush()
    p10 = Payment(
        booking_group_id=g10,
        player_id=sana.id,
        amount=b10.total_amount,
        currency="PKR",
        payment_method=PaymentMethod.card,
        payment_provider="stripe",
        gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
        status=PaymentStatus.refunded,
        payment_type=PaymentPlan.full,
    )
    db.add(p10)
    await db.flush()
    db.add(
        Refund(
            booking_id=b10.id,
            payment_id=p10.id,
            amount=b10.total_amount,
            reason="Cancelled more than 24 hours before start — full refund per policy.",
            status=RefundStatus.processed,
            processed_at=datetime.now(),
        )
    )

    # -- Islamabad Sports Center (Bilal Chaudhry) --------------------------
    slot = slot_at("Islamabad Sports Center", "Cricket Ground", -5, 14)
    b11, g11 = make_booking(
        player=waqas,
        arena=arenas_by_name["Islamabad Sports Center"],
        court=courts_by_arena["Islamabad Sports Center"]["Cricket Ground"],
        slot=slot,
        status=BookingStatus.completed,
        payment_type=PaymentPlan.full,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g11,
            player_id=waqas.id,
            amount=b11.total_amount,
            currency="PKR",
            payment_method=PaymentMethod.card,
            payment_provider="stripe",
            gateway_transaction_id=f"ch_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.full,
        )
    )
    await db.flush()
    r11 = Review(
        player_id=waqas.id,
        arena_id=arenas_by_name["Islamabad Sports Center"].id,
        booking_id=b11.id,
        rating=2,
        review_text="Ground wasn't rolled properly before the match.",
        is_flagged=True,
        flag_reason="Player disputes ground condition — owner requested review.",
        flagged_at=datetime.now(),
    )
    db.add(r11)
    review_ids.append(str(r11.id))

    slot = slot_at("Islamabad Sports Center", "Badminton Court A", 1, 19)
    b12, g12 = make_booking(
        player=iqra,
        arena=arenas_by_name["Islamabad Sports Center"],
        court=courts_by_arena["Islamabad Sports Center"]["Badminton Court A"],
        slot=slot,
        status=BookingStatus.confirmed,
        payment_type=PaymentPlan.advance,
        payment_status=PaymentStatus.completed,
        slot_status=SlotStatus.booked,
    )
    await db.flush()
    db.add(
        Payment(
            booking_group_id=g12,
            player_id=iqra.id,
            amount=b12.advance_amount,
            currency="PKR",
            payment_method=PaymentMethod.jazzcash,
            payment_provider="jazzcash",
            gateway_transaction_id=f"jc_{uuid.uuid4().hex[:16]}",
            status=PaymentStatus.completed,
            payment_type=PaymentPlan.advance,
        )
    )

    await db.flush()

    for b, g in [
        (b1, g1),
        (b2, g2),
        (b3, None),
        (b4, g4),
        (b5, g5),
        (b6, g6),
        (b7, g7),
        (b8, g8),
        (b9, g9),
        (b10, g10),
        (b11, g11),
        (b12, g12),
    ]:
        booking_ids.append(str(b.id))
        if g is not None:
            payment_ids.append(str(g))

    equipment_ids = [str(e.id) for rows in equipment_by_arena.values() for e in rows]

    manifest["bookings_v2"] = booking_ids
    manifest["payment_booking_groups_v2"] = payment_ids
    manifest["equipment_v2"] = equipment_ids
    manifest["reviews_v2"] = review_ids
    manifest["flow_seeded_v2"] = True
    print(
        f"created: {len(_V2_NEW_ARENA_NAMES)} multi-owner arenas' bookings "
        f"(12 bookings, {len(review_ids)} reviews, equipment + refunds)"
    )


# Receiving accounts shown to players at bank-transfer checkout — one per
# approved arena (DHA Lahore gets a second, non-default account to exercise
# the multi-account UI). Created by `_seed_showcase_v3`, gated by the
# "flow_seeded_v3" manifest flag.
# arena name -> [(label, bank, account_title, account_number, iban, is_default)]
BANK_DETAILS_V3: dict[str, list[tuple[str | None, str, str, str, str, bool]]] = {
    "Arena Hub DHA Lahore": [
        (
            "Meezan Main",
            "Meezan Bank",
            "Demo Owner",
            "0101234567890",
            "PK36MEZN0001012345678901",
            True,
        ),
        (
            "HBL Backup",
            "HBL",
            "Demo Owner",
            "1234567890123",
            "PK55HABB0012345678901234",
            False,
        ),
    ],
    "Arena Hub Gulberg Lahore": [
        (None, "HBL", "Demo Owner", "2234567890123", "PK21HABB0022345678901234", True),
    ],
    "Multan Sports Complex": [
        (None, "UBL", "Ali Raza", "3234567890123", "PK47UNIL0032345678901234", True),
    ],
    "Lahore Arena": [
        (None, "Bank Alfalah", "Ahmed Sheikh", "4234567890123", "PK62ALFH0042345678901234", True),
    ],
    "Karachi Indoor Arena": [
        (None, "Meezan Bank", "Usman Farooq", "5234567890123", "PK83MEZN0052345678901234", True),
    ],
    "Islamabad Sports Center": [
        (None, "MCB", "Bilal Chaudhry", "6234567890123", "PK19MUCB0062345678901234", True),
    ],
}


async def _seed_showcase_v3(
    db: AsyncSession, arenas_by_name: dict[str, Arena], manifest: dict
) -> None:
    """Everything the dashboards show that bookings alone don't cover:
    arena bank accounts, admin-side complaints, "Play" matches with
    participants, in-app notifications, liked arenas, and audit-log entries
    — so no screen on any of the three sides opens onto an empty table."""
    players = await _get_or_create_players(db)
    by_email = {p.email: p for p in players}
    ahmed_raza = by_email["ahmed.raza@example.com"]
    sara = by_email["sara.khan@example.com"]
    bilal_a = by_email["bilal.ahmed@example.com"]
    hina = by_email["hina.malik@example.com"]
    usman_t = by_email["usman.tariq@example.com"]
    ayesha = by_email["ayesha.siddiqui@example.com"]
    kamran = by_email["kamran.malik@example.com"]
    sadia = by_email["sadia.yousuf@example.com"]
    fahad = by_email["fahad.iqbal@example.com"]
    mehwish = by_email["mehwish.anwar@example.com"]
    junaid = by_email["junaid.khalid@example.com"]
    sana = by_email["sana.riaz@example.com"]
    waqas = by_email["waqas.ahmed@example.com"]
    iqra = by_email["iqra.noor@example.com"]
    hamza = by_email["hamza.sheikh@example.com"]

    admin = (await db.execute(select(User).where(User.email == ADMIN_EMAIL))).scalar_one()
    owners_by_email = {
        u.email: u
        for u in (await db.execute(select(User).where(User.role == UserRole.owner))).scalars().all()
    }

    async def court_of(arena_name: str, court_name: str) -> Court:
        arena = arenas_by_name[arena_name]
        return (
            await db.execute(
                select(Court).where(Court.arena_id == arena.id, Court.name == court_name)
            )
        ).scalar_one()

    def days_ago(n: int, hour: int = 12) -> datetime:
        return datetime.combine(TODAY - timedelta(days=n), time(hour, 0))

    def days_ago_utc(n: int, hour: int = 12) -> datetime:
        return days_ago(n, hour).replace(tzinfo=UTC)

    # -- Bank accounts for bank-transfer checkout ------------------------
    bank_rows: list[ArenaBankDetails] = []
    for arena_name, accounts in BANK_DETAILS_V3.items():
        arena = arenas_by_name[arena_name]
        for label, bank, title, account_number, iban, is_default in accounts:
            row = ArenaBankDetails(
                arena_id=arena.id,
                label=label,
                bank_name=bank,
                account_title=title,
                account_number=account_number,
                iban=iban,
                payment_instructions=(
                    "Transfer the exact amount and upload a clear photo of the "
                    "receipt. Bookings are confirmed once the owner verifies it."
                ),
                is_default=is_default,
                is_active=True,
            )
            db.add(row)
            bank_rows.append(row)
    await db.flush()
    bank_detail_ids = [str(r.id) for r in bank_rows]

    # -- Complaints (admin support inbox) --------------------------------
    complaints = [
        Complaint(
            player_id=ahmed_raza.id,
            category=ComplaintCategory.payment_issue,
            description=(
                "I was charged twice for my futsal booking at Arena Hub DHA "
                "Lahore on Friday. Please refund the duplicate charge."
            ),
            status=ComplaintStatus.open,
            created_at=days_ago(1, 10),
            updated_at=days_ago(1, 10),
        ),
        Complaint(
            player_id=sara.id,
            category=ComplaintCategory.arena_quality,
            description=(
                "Half the floodlights at Arena Hub Gulberg Lahore were out "
                "during our evening cricket booking — hard to see the ball."
            ),
            status=ComplaintStatus.open,
            created_at=days_ago(2, 20),
            updated_at=days_ago(2, 20),
        ),
        Complaint(
            player_id=iqra.id,
            category=ComplaintCategory.booking_issue,
            description=(
                "The app showed the 7 PM badminton slot as available but my "
                "booking was rejected an hour later. Why was it listed?"
            ),
            status=ComplaintStatus.open,
            created_at=days_ago(0, 9),
            updated_at=days_ago(0, 9),
        ),
        Complaint(
            player_id=fahad.id,
            category=ComplaintCategory.owner_behavior,
            description=(
                "The staff at the badminton court cut our session 15 minutes "
                "short even though we paid for the full hour."
            ),
            status=ComplaintStatus.under_review,
            assigned_to=admin.id,
            created_at=days_ago(4, 18),
            updated_at=days_ago(3, 11),
        ),
        Complaint(
            player_id=mehwish.id,
            category=ComplaintCategory.technical_problem,
            description=(
                "The app crashes every time I open the payment screen on my "
                "phone after selecting JazzCash."
            ),
            status=ComplaintStatus.under_review,
            assigned_to=admin.id,
            created_at=days_ago(3, 14),
            updated_at=days_ago(2, 9),
        ),
        Complaint(
            player_id=junaid.id,
            category=ComplaintCategory.booking_issue,
            description=(
                "My tennis booking disappeared from the app after I "
                "rescheduled it. The court says they never got it."
            ),
            status=ComplaintStatus.resolved,
            assigned_to=admin.id,
            admin_response=(
                "The reschedule had failed silently — we restored your booking "
                "and added a free hour as an apology. The bug is fixed."
            ),
            resolved_at=days_ago_utc(6, 15),
            created_at=days_ago(8, 12),
            updated_at=days_ago(6, 15),
        ),
        Complaint(
            player_id=sana.id,
            category=ComplaintCategory.payment_issue,
            description="My refund for the cancelled badminton slot never arrived.",
            status=ComplaintStatus.resolved,
            assigned_to=admin.id,
            admin_response=(
                "The refund was stuck at the gateway; it has been re-issued "
                "and should reach your account within 3 working days."
            ),
            resolved_at=days_ago_utc(7, 10),
            created_at=days_ago(9, 16),
            updated_at=days_ago(7, 10),
        ),
        Complaint(
            player_id=usman_t.id,
            category=ComplaintCategory.other,
            description="Please add hockey as a sport filter — several grounds near me offer it.",
            status=ComplaintStatus.resolved,
            assigned_to=admin.id,
            admin_response="Thanks for the suggestion — it's on our roadmap for a future update.",
            resolved_at=days_ago_utc(10, 13),
            created_at=days_ago(12, 8),
            updated_at=days_ago(10, 13),
        ),
    ]
    db.add_all(complaints)
    await db.flush()
    complaint_ids = [str(c.id) for c in complaints]

    # -- "Play" matches with participants --------------------------------
    async def make_match(
        creator: User,
        arena_name: str,
        court_name: str,
        sport: str,
        day_offset: int,
        start_hour: int,
        duration_hours: int,
        max_players: int,
        status: MatchStatus,
        joiners: list[User],
    ) -> Match:
        court = await court_of(arena_name, court_name)
        match = Match(
            creator_id=creator.id,
            arena_id=arenas_by_name[arena_name].id,
            court_id=court.id,
            sport=sport,
            match_date=TODAY + timedelta(days=day_offset),
            start_time=time(start_hour, 0),
            end_time=time(start_hour + duration_hours, 0),
            max_players=max_players,
            status=status,
        )
        db.add(match)
        await db.flush()
        # The creator is always the first participant (mirrors match creation
        # in the app), then everyone who joined after.
        for player in [creator, *joiners]:
            db.add(MatchParticipant(match_id=match.id, player_id=player.id))
        return match

    matches = [
        await make_match(
            ahmed_raza,
            "Arena Hub DHA Lahore",
            "Court 1",
            "futsal",
            2,
            20,
            1,
            10,
            MatchStatus.open,
            [hina, usman_t, bilal_a, hamza],
        ),
        await make_match(
            waqas,
            "DHA Sports Club",
            "Cricket Ground",
            "cricket",
            4,
            16,
            2,
            22,
            MatchStatus.open,
            [sara, ayesha, sadia, usman_t, hamza, kamran],
        ),
        await make_match(
            bilal_a,
            "Arena Hub DHA Lahore",
            "Court 4",
            "padel",
            1,
            18,
            1,
            4,
            MatchStatus.open,
            [hina, mehwish],
        ),
        await make_match(
            fahad,
            "Lahore Arena",
            "Badminton Court A",
            "badminton",
            3,
            19,
            1,
            4,
            MatchStatus.full,
            [mehwish, sana, iqra],
        ),
        await make_match(
            hamza,
            "Islamabad Sports Center",
            "Football Court 1",
            "futsal",
            -3,
            21,
            1,
            10,
            MatchStatus.completed,
            [waqas, iqra, ahmed_raza, usman_t, kamran],
        ),
        await make_match(
            sadia,
            "Multan Sports Complex",
            "Cricket Ground",
            "cricket",
            5,
            17,
            2,
            22,
            MatchStatus.cancelled,
            [kamran],
        ),
    ]
    match_ids = [str(m.id) for m in matches]

    # -- In-app notifications (players + owners) -------------------------
    # Titles/bodies mirror EVENT_META in app/modules/notification/service.py
    # so the seeded rows render exactly like ones the app produces.
    def notif(
        user: User,
        event: str,
        title: str,
        body: str,
        days_back: int,
        hour: int,
        read: bool,
    ) -> Notification:
        created = days_ago_utc(days_back, hour)
        return Notification(
            user_id=user.id,
            event=event,
            title=title,
            body=body,
            data={},
            read_at=created + timedelta(hours=2) if read else None,
            created_at=created,
        )

    confirmed_body = "Your booking is confirmed. See you on the court!"
    notifications = [
        notif(ahmed_raza, "booking_confirmed", "Booking confirmed", confirmed_body, 0, 9, False),
        notif(
            ahmed_raza,
            "booking_reminder_24h",
            "Upcoming booking tomorrow",
            "You have a booking starting in about 24 hours.",
            1,
            18,
            True,
        ),
        notif(sara, "booking_confirmed", "Booking confirmed", confirmed_body, 1, 11, False),
        notif(
            sara,
            "booking_reminder_1h",
            "Booking starting soon",
            "You have a booking starting in about 1 hour.",
            2,
            15,
            True,
        ),
        notif(
            bilal_a,
            "booking_cancelled",
            "Booking cancelled",
            "Your booking has been cancelled.",
            3,
            10,
            True,
        ),
        notif(
            sana,
            "refund_initiated",
            "Refund initiated",
            "A refund of PKR 1500 has been initiated for your booking.",
            2,
            12,
            False,
        ),
        notif(
            kamran,
            "balance_paid",
            "Balance paid",
            "Your outstanding balance has been paid. Your booking is fully settled.",
            4,
            17,
            True,
        ),
        notif(iqra, "booking_confirmed", "Booking confirmed", confirmed_body, 0, 8, False),
        notif(
            mehwish,
            "booking_payment_failed",
            "Payment failed",
            "Payment for your booking could not be completed.",
            1,
            20,
            False,
        ),
        notif(
            hamza,
            "booking_reminder_24h",
            "Upcoming booking tomorrow",
            "You have a booking starting in about 24 hours.",
            0,
            7,
            False,
        ),
    ]
    for owner_email, count, days_back in [
        (OWNER_EMAIL, 3, 0),
        ("ali.owner@arenahub.pk", 2, 1),
        ("ahmed.owner@arenahub.pk", 1, 1),
        ("usman.owner@arenahub.pk", 1, 2),
        ("bilal.owner@arenahub.pk", 2, 0),
    ]:
        notifications.append(
            notif(
                owners_by_email[owner_email],
                "new_confirmed_booking",
                "New booking received",
                f"You have {count} new confirmed booking(s).",
                days_back,
                9,
                False,
            )
        )
    db.add_all(notifications)
    await db.flush()
    notification_ids = [str(n.id) for n in notifications]

    # -- Liked arenas (mobile bookmarks) ---------------------------------
    likes = [
        ArenaLike(player_id=player.id, arena_id=arenas_by_name[arena_name].id)
        for player, arena_name in [
            (ahmed_raza, "Arena Hub DHA Lahore"),
            (ahmed_raza, "Arena Hub Gulberg Lahore"),
            (sara, "Arena Hub DHA Lahore"),
            (sara, "DHA Sports Club"),
            (bilal_a, "Arena Hub DHA Lahore"),
            (hina, "Arena Hub Gulberg Lahore"),
            (ayesha, "Karachi Indoor Arena"),
            (kamran, "Multan Sports Complex"),
            (sadia, "Multan Sports Complex"),
            (fahad, "Lahore Arena"),
            (junaid, "Karachi Indoor Arena"),
            (waqas, "Islamabad Sports Center"),
            (hamza, "Islamabad Sports Center"),
        ]
    ]
    db.add_all(likes)
    await db.flush()
    like_ids = [str(x.id) for x in likes]

    # -- Audit-log entries mirroring the arenas' actual moderation state --
    audit_rows = [
        AuditLog(
            actor_id=admin.id,
            action="arena.approve",
            target_type="arena",
            target_id=str(arenas_by_name["Multan Sports Complex"].id),
            details={},
            created_at=days_ago(9, 11),
            updated_at=days_ago(9, 11),
        ),
        AuditLog(
            actor_id=admin.id,
            action="arena.approve",
            target_type="arena",
            target_id=str(arenas_by_name["Lahore Arena"].id),
            details={},
            created_at=days_ago(8, 16),
            updated_at=days_ago(8, 16),
        ),
        AuditLog(
            actor_id=admin.id,
            action="arena.reject",
            target_type="arena",
            target_id=str(arenas_by_name["Arena Hub Johar Town Lahore"].id),
            details={"reason": REJECTION_REASON},
            created_at=days_ago(7, 14),
            updated_at=days_ago(7, 14),
        ),
    ]
    db.add_all(audit_rows)
    await db.flush()
    audit_ids = [str(a.id) for a in audit_rows]

    # -- Align bank-transfer payments awaiting owner approval ------------
    # The lifecycle-status migration backfilled from the coarse status, which
    # leaves receipt-uploaded payments at `pending`; the app would have moved
    # them to `pending_approval` when the receipt was uploaded.
    pending_groups = (
        (
            await db.execute(
                select(Booking.booking_group_id).where(
                    Booking.status == BookingStatus.pending_approval
                )
            )
        )
        .scalars()
        .all()
    )
    if pending_groups:
        await db.execute(
            update(Payment)
            .where(
                Payment.booking_group_id.in_(pending_groups),
                Payment.payment_method == PaymentMethod.bank_transfer,
                Payment.lifecycle_status == PaymentLifecycleStatus.pending,
            )
            .values(lifecycle_status=PaymentLifecycleStatus.pending_approval)
        )

    manifest["bank_details_v3"] = bank_detail_ids
    manifest["complaints_v3"] = complaint_ids
    manifest["matches_v3"] = match_ids
    manifest["notifications_v3"] = notification_ids
    manifest["arena_likes_v3"] = like_ids
    manifest["audit_logs_v3"] = audit_ids
    manifest["flow_seeded_v3"] = True
    print(
        f"created: {len(bank_detail_ids)} bank accounts, {len(complaint_ids)} complaints, "
        f"{len(match_ids)} matches, {len(notification_ids)} notifications, "
        f"{len(like_ids)} liked arenas, {len(audit_ids)} audit-log entries"
    )


async def _refresh_transaction_timestamps(db: AsyncSession, manifest: dict) -> None:
    """Seeded bookings/payments get `created_at = the moment the seed first
    ran`, so the owner revenue-trend chart (which buckets by payment
    `created_at`) drains to zero as that day recedes into the past. Re-anchor
    every seeded row to just before its booking's play date — clamped to now
    for future-dated bookings — so the last-7-days analytics always show
    activity no matter how long ago the data was seeded. Runs on every seed
    invocation and only touches manifested rows, never UI-created ones."""
    booking_ids = [
        uuid.UUID(b) for b in manifest.get("bookings", []) + manifest.get("bookings_v2", [])
    ]
    payment_groups = [
        uuid.UUID(g)
        for g in manifest.get("payment_booking_groups", [])
        + manifest.get("payment_booking_groups_v2", [])
    ]
    if not booking_ids:
        return

    now = datetime.now()
    bookings = (
        (await db.execute(select(Booking).where(Booking.id.in_(booking_ids)))).scalars().all()
    )
    anchor_by_group: dict[uuid.UUID, datetime] = {}
    for booking in bookings:
        anchor = datetime.combine(booking.booking_date, booking.start_time)
        existing = anchor_by_group.get(booking.booking_group_id)
        if existing is None or anchor < existing:
            anchor_by_group[booking.booking_group_id] = anchor
        booked_at = min(anchor - timedelta(hours=26), now - timedelta(hours=2))
        booking.created_at = booked_at
        booking.updated_at = booked_at

    if payment_groups:
        payments = (
            (await db.execute(select(Payment).where(Payment.booking_group_id.in_(payment_groups))))
            .scalars()
            .all()
        )
        for payment in payments:
            group_anchor = anchor_by_group.get(payment.booking_group_id)
            if group_anchor is None:
                continue
            paid_at = min(group_anchor - timedelta(hours=25), now - timedelta(hours=1))
            payment.created_at = paid_at
            payment.updated_at = paid_at
    await db.flush()


async def _manifest_complaints_still_exist(db: AsyncSession, complaint_ids: list[str]) -> bool:
    """Same spot-check as `_manifest_bookings_still_exist`, for the v3 flow."""
    if not complaint_ids:
        return False
    ids = [uuid.UUID(c) for c in complaint_ids]
    result = await db.execute(select(Complaint.id).where(Complaint.id.in_(ids)))
    return len(result.scalars().all()) == len(ids)


async def _manifest_bookings_still_exist(db: AsyncSession, booking_ids: list[str]) -> bool:
    """A manifest flag like `flow_seeded` only means "we created these rows at
    some point" — if the DB was since wiped/recreated (e.g. clear_dummy_data.py,
    a fresh migration, a different DB target) while the manifest file survived,
    trusting the flag alone skips re-seeding into an actually-empty table. Spot
    check that the recorded booking IDs are still present before trusting it."""
    if not booking_ids:
        return False
    ids = [uuid.UUID(b) for b in booking_ids]
    result = await db.execute(select(Booking.id).where(Booking.id.in_(ids)))
    return len(result.scalars().all()) == len(ids)


async def seed() -> None:
    existing_manifest: dict = {}
    if MANIFEST_PATH.exists():
        existing_manifest = json.loads(MANIFEST_PATH.read_text())

    manifest: dict = {"arenas": []}
    async with SessionFactory() as db:
        all_arenas_by_name: dict[str, Arena] = {}
        for spec in OWNERS:
            owner = await _get_or_create_owner(
                db,
                full_name=spec["full_name"],
                email=spec["email"],
                phone=spec["phone"],
                password=spec["password"],
            )
            arenas_by_name = await _seed_arenas(db, owner, spec["arenas"], manifest)
            all_arenas_by_name.update(arenas_by_name)

        admin = await _get_or_create_admin(db)
        manifest["admin_id"] = str(admin.id)
        await db.commit()

        flow_seeded = existing_manifest.get("flow_seeded") and await _manifest_bookings_still_exist(
            db, existing_manifest.get("bookings", [])
        )
        if flow_seeded:
            print("skip (already exists): player-side flow (bookings/payments/reviews)")
            manifest.update(
                {
                    k: existing_manifest[k]
                    for k in (
                        "players",
                        "bookings",
                        "payment_booking_groups",
                        "equipment",
                        "reviews",
                        "flow_seeded",
                    )
                    if k in existing_manifest
                }
            )
        else:
            await _seed_player_flow(db, all_arenas_by_name, manifest)
            await db.commit()

        flow_seeded_v2 = existing_manifest.get(
            "flow_seeded_v2"
        ) and await _manifest_bookings_still_exist(db, existing_manifest.get("bookings_v2", []))
        if flow_seeded_v2:
            print("skip (already exists): multi-owner player-side flow (bookings/payments/reviews)")
            manifest.update(
                {
                    k: existing_manifest[k]
                    for k in (
                        "bookings_v2",
                        "payment_booking_groups_v2",
                        "equipment_v2",
                        "reviews_v2",
                        "flow_seeded_v2",
                    )
                    if k in existing_manifest
                }
            )
        else:
            await _seed_player_flow_v2(db, all_arenas_by_name, manifest)
            await db.commit()

        flow_seeded_v3 = existing_manifest.get(
            "flow_seeded_v3"
        ) and await _manifest_complaints_still_exist(db, existing_manifest.get("complaints_v3", []))
        if flow_seeded_v3:
            print("skip (already exists): showcase data (complaints/matches/notifications/likes)")
            manifest.update(
                {
                    k: existing_manifest[k]
                    for k in (
                        "bank_details_v3",
                        "complaints_v3",
                        "matches_v3",
                        "notifications_v3",
                        "arena_likes_v3",
                        "audit_logs_v3",
                        "flow_seeded_v3",
                    )
                    if k in existing_manifest
                }
            )
        else:
            await _seed_showcase_v3(db, all_arenas_by_name, manifest)
            await db.commit()

        await _refresh_transaction_timestamps(db, manifest)
        await db.commit()
        print("refreshed: booking/payment timestamps re-anchored to booking dates")

        # Always recomputed so the manifest reflects the full current player
        # roster (v2 adds players to PLAYERS that v1's skip-branch above
        # wouldn't otherwise pick up).
        all_players = (
            (await db.execute(select(User).where(User.role == UserRole.player))).scalars().all()
        )
        seeded_emails = {p[1] for p in PLAYERS}
        manifest["players"] = [str(p.id) for p in all_players if p.email in seeded_emails]

    if (
        not manifest["arenas"]
        and not manifest.get("flow_seeded")
        and not manifest.get("flow_seeded_v2")
        and not manifest.get("flow_seeded_v3")
    ):
        print("\nNothing new to seed — all demo data already exists.")
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, default=str))
    print(f"\nWrote manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    asyncio.run(seed())
