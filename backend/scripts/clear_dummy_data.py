"""Remove exactly the demo data `seed_dummy_data.py` created.

Reads `.seed_manifest.json` for the arena IDs that script recorded and deletes
those arenas — courts, peak-pricing rules, discount codes, and blocked dates
all cascade-delete with them (ondelete=CASCADE on every child FK). Anything
the owner created manually through the UI is untouched, since only the
manifested IDs are deleted.

Usage (from backend/):
    uv run python scripts/clear_dummy_data.py
"""

import asyncio
import json
import uuid
from pathlib import Path

from app.database.session import SessionFactory
from app.modules.arena.model import Arena

MANIFEST_PATH = Path(__file__).parent / ".seed_manifest.json"


async def clear() -> None:
    if not MANIFEST_PATH.exists():
        print(
            f"No manifest at {MANIFEST_PATH} — nothing to clear (already clean, or never seeded)."
        )
        return

    manifest = json.loads(MANIFEST_PATH.read_text())
    arena_ids = [uuid.UUID(a["id"]) for a in manifest.get("arenas", [])]

    async with SessionFactory() as db:
        removed = 0
        for arena_id in arena_ids:
            arena = await db.get(Arena, arena_id)
            if arena is None:
                continue
            print(f"deleting: {arena.name}")
            await db.delete(arena)
            removed += 1
        await db.commit()

    MANIFEST_PATH.unlink()
    print(f"\nRemoved {removed} demo arena(s) (courts/pricing/discounts/blocked-dates cascaded).")
    print("Manifest deleted.")


if __name__ == "__main__":
    asyncio.run(clear())
