"""One standard amenity list: a key on every amenity, and older typed ones kept as extra text.

Every existing amenity whose name stands for a standard one (same letters, any case, any dash or space,
a plural "s" ignored) becomes that standard amenity, with the standard name; arenas that had it keep
it. Any other amenity is not thrown away: its name moves to the arena's ``extra_amenities`` (shown on
the arena page, the owner can take it off) and the old row goes. The standard rows that no arena had are
added. Downgrade turns the extra text back into amenity rows.

The list is copied here on purpose (a migration must not change when the app's list does).

Revision ID: e1b9c7a4d2f6
Revises: d1a6f3b9c4e8
Create Date: 2026-10-23
"""

import logging
import re
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e1b9c7a4d2f6"
down_revision: str | None = "d1a6f3b9c4e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

log = logging.getLogger("alembic.runtime.migration")

STANDARD = (
    ("parking", "Parking"),
    ("floodlights", "Floodlights"),
    ("washrooms", "Washrooms"),
    ("changing_room", "Changing room"),
    ("drinking_water", "Drinking water"),
    ("cafeteria", "Cafeteria"),
    ("wifi", "Wi-Fi"),
    ("first_aid", "First aid"),
    ("seating", "Seating"),
    ("shower", "Shower"),
    ("air_conditioning", "Air conditioning"),
    ("equipment_rental", "Equipment rental"),
    ("cctv", "CCTV"),
    ("prayer_area", "Prayer area"),
)


def _squash(text: str) -> str:
    letters = re.sub(r"[^a-z0-9]", "", text.lower())
    return letters[:-1] if letters.endswith("s") else letters


KEY_BY_SQUASHED = {
    **{_squash(name): key for key, name in STANDARD},
    **{_squash(key): key for key, _ in STANDARD},
}
NAME_BY_KEY = dict(STANDARD)


def upgrade() -> None:
    conn = op.get_bind()
    op.add_column("amenities", sa.Column("key", sa.String(length=50), nullable=True))
    op.add_column(
        "arenas",
        sa.Column(
            "extra_amenities",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )

    rows = conn.execute(sa.text("SELECT id, name FROM amenities ORDER BY name")).all()
    groups: dict[str, list] = {}
    unmatched = []
    for row in rows:
        key = KEY_BY_SQUASHED.get(_squash(row.name))
        if key is None:
            unmatched.append(row)
        else:
            groups.setdefault(key, []).append(row)

    merged = 0
    for std_key, members in groups.items():
        # keep the row that already carries the standard name, else the first
        members.sort(key=lambda r: r.name != NAME_BY_KEY[std_key])
        keeper, extras = members[0], members[1:]
        for dup in extras:
            conn.execute(
                sa.text(
                    "INSERT INTO arena_amenities (arena_id, amenity_id) "
                    "SELECT arena_id, :keep FROM arena_amenities WHERE amenity_id = :dup "
                    "ON CONFLICT DO NOTHING"
                ),
                {"keep": keeper.id, "dup": dup.id},
            )
            conn.execute(sa.text("DELETE FROM amenities WHERE id = :dup"), {"dup": dup.id})
            merged += 1
        conn.execute(
            sa.text("UPDATE amenities SET key = :key, name = :name WHERE id = :id"),
            {"key": std_key, "name": NAME_BY_KEY[std_key], "id": keeper.id},
        )

    moved = 0
    for row in unmatched:
        arenas = conn.execute(
            sa.text("SELECT arena_id FROM arena_amenities WHERE amenity_id = :id"), {"id": row.id}
        ).all()
        for arena in arenas:
            conn.execute(
                sa.text(
                    "UPDATE arenas SET extra_amenities = extra_amenities || to_jsonb(CAST(:name AS text)) "
                    "WHERE id = :arena AND NOT jsonb_exists(extra_amenities, :name)"
                ),
                {"name": row.name, "arena": arena.arena_id},
            )
            moved += 1
        conn.execute(sa.text("DELETE FROM amenities WHERE id = :id"), {"id": row.id})

    have = {k for k in groups}
    for key, name in STANDARD:
        if key not in have:
            conn.execute(
                sa.text("INSERT INTO amenities (id, key, name) VALUES (:id, :key, :name)"),
                {"id": uuid.uuid4(), "key": key, "name": name},
            )

    op.alter_column("amenities", "key", nullable=False)
    op.create_unique_constraint(op.f("uq_amenities_key"), "amenities", ["key"])
    log.info(
        "amenities: %d old rows matched a standard one (%d merged into another), "
        "%d kept as extra text on %d arena links",
        sum(len(m) for m in groups.values()),
        merged,
        len(unmatched),
        moved,
    )


def downgrade() -> None:
    conn = op.get_bind()
    op.alter_column("amenities", "key", nullable=True)
    names = conn.execute(
        sa.text("SELECT DISTINCT jsonb_array_elements_text(extra_amenities) AS n FROM arenas")
    ).all()
    for (name,) in names:
        conn.execute(
            sa.text(
                "INSERT INTO amenities (id, name) VALUES (:id, :name) ON CONFLICT (name) DO NOTHING"
            ),
            {"id": uuid.uuid4(), "name": name[:100]},
        )
        conn.execute(
            sa.text(
                "INSERT INTO arena_amenities (arena_id, amenity_id) "
                "SELECT a.id, m.id FROM arenas a, amenities m "
                "WHERE m.name = :name AND jsonb_exists(a.extra_amenities, :name) ON CONFLICT DO NOTHING"
            ),
            {"name": name[:100]},
        )
    op.drop_constraint(op.f("uq_amenities_key"), "amenities", type_="unique")
    op.drop_column("amenities", "key")
    op.drop_column("arenas", "extra_amenities")
