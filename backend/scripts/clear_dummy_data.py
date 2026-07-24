"""Remove exactly the demo data `seed_dummy_data.py` created.

Reads `.seed_manifest.json` for the arena/booking/player/equipment ids that
script recorded and deletes them in FK-safe order (showcase rows —
notifications/likes/matches/complaints/audit-logs/bank-accounts — then
refunds/reviews/rented-equipment -> bookings -> payments -> equipment ->
arenas -> demo players).
Arenas cascade-delete their courts, pricing rules, discount codes, blocked
dates, and time slots. Anything the owner created manually through the UI is
untouched, since only the manifested IDs are deleted.

Usage (from backend/):
    uv run python scripts/clear_dummy_data.py
"""

import asyncio
import json
import uuid
from pathlib import Path
from typing import Any, cast

from sqlalchemy import CursorResult, delete, select, update

from app.database.session import SessionFactory
from app.modules.admin.model import AuditLog
from app.modules.arena.model import Arena, ArenaBankDetails, ArenaLike
from app.modules.booking.model import Booking
from app.modules.complaint.model import Complaint

# Imported for their mapper side effect only: the bulk deletes below make
# SQLAlchemy configure every mapper, and Arena/Booking resolve "Court" /
# "TimeSlot" relationship strings through the registry.
from app.modules.court.model import Court  # noqa: F401
from app.modules.equipment.model import BookingEquipment, Equipment
from app.modules.match.model import Match
from app.modules.notification.model import Notification
from app.modules.payment.model import Payment, Refund
from app.modules.review.model import Review
from app.modules.slot.model import SlotStatus, TimeSlot
from app.modules.user.model import User

MANIFEST_PATH = Path(__file__).parent / ".seed_manifest.json"


async def clear() -> None:
    if not MANIFEST_PATH.exists():
        print(
            f"No manifest at {MANIFEST_PATH} — nothing to clear (already clean, or never seeded)."
        )
        return

    manifest = json.loads(MANIFEST_PATH.read_text())
    arena_ids = [uuid.UUID(a["id"]) for a in manifest.get("arenas", [])]
    booking_ids = [
        uuid.UUID(b) for b in manifest.get("bookings", []) + manifest.get("bookings_v2", [])
    ]
    player_ids = [uuid.UUID(p) for p in manifest.get("players", [])]
    equipment_ids = [
        uuid.UUID(e) for e in manifest.get("equipment", []) + manifest.get("equipment_v2", [])
    ]
    payment_groups = [
        uuid.UUID(g)
        for g in manifest.get("payment_booking_groups", [])
        + manifest.get("payment_booking_groups_v2", [])
    ]

    showcase_tables: list[tuple[Any, str, str]] = [
        (Notification, "notifications_v3", "notification(s)"),
        (ArenaLike, "arena_likes_v3", "liked-arena bookmark(s)"),
        (Match, "matches_v3", "match(es) (participants cascaded)"),
        (Complaint, "complaints_v3", "complaint(s)"),
        (AuditLog, "audit_logs_v3", "audit-log entr(ies)"),
        (ArenaBankDetails, "bank_details_v3", "bank account(s)"),
    ]

    async with SessionFactory() as db:
        for model, manifest_key, label in showcase_tables:
            ids = []
            for i in manifest.get(manifest_key, []):
                try:
                    ids.append(uuid.UUID(i))
                except ValueError:
                    continue  # tolerate malformed entries from older manifests
            if not ids:
                continue
            result = cast(
                "CursorResult[Any]", await db.execute(delete(model).where(model.id.in_(ids)))
            )
            print(f"deleted {result.rowcount} {label}")

        if booking_ids:
            # Free the slots the demo bookings held — otherwise they stay
            # stuck at booked/reserved with no booking behind them and show
            # as unavailable in the app forever.
            slot_ids = (
                (await db.execute(select(Booking.slot_id).where(Booking.id.in_(booking_ids))))
                .scalars()
                .all()
            )
            if slot_ids:
                await db.execute(
                    update(TimeSlot)
                    .where(TimeSlot.id.in_(slot_ids))
                    .values(status=SlotStatus.available)
                )
            await db.execute(delete(Refund).where(Refund.booking_id.in_(booking_ids)))
            await db.execute(delete(Review).where(Review.booking_id.in_(booking_ids)))
            await db.execute(
                delete(BookingEquipment).where(BookingEquipment.booking_id.in_(booking_ids))
            )
            result = cast(
                "CursorResult[Any]",
                await db.execute(delete(Booking).where(Booking.id.in_(booking_ids))),
            )
            print(
                f"deleted {result.rowcount} booking(s) and their reviews/refunds/rented-equipment"
            )

        if payment_groups:
            result = cast(
                "CursorResult[Any]",
                await db.execute(
                    delete(Payment).where(Payment.booking_group_id.in_(payment_groups))
                ),
            )
            print(f"deleted {result.rowcount} payment(s)")

        if equipment_ids:
            result = cast(
                "CursorResult[Any]",
                await db.execute(delete(Equipment).where(Equipment.id.in_(equipment_ids))),
            )
            print(f"deleted {result.rowcount} equipment item(s)")

        removed = 0
        for arena_id in arena_ids:
            arena = await db.get(Arena, arena_id)
            if arena is None:
                continue
            print(f"deleting: {arena.name}")
            await db.delete(arena)
            removed += 1

        if player_ids:
            result = cast(
                "CursorResult[Any]", await db.execute(delete(User).where(User.id.in_(player_ids)))
            )
            print(f"deleted {result.rowcount} demo player account(s)")

        await db.commit()

    MANIFEST_PATH.unlink()
    print(
        f"\nRemoved {removed} demo arena(s) "
        "(courts/pricing/discounts/blocked-dates/slots cascaded)."
    )
    print("Manifest deleted.")


if __name__ == "__main__":
    asyncio.run(clear())
