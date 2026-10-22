"""Arena latitude/longitude become optional.

An owner can now skip the map pin when registering or editing an arena (item 6C):
"near me" sorting and distance already handle a missing position gracefully
(arena/repository.py's nulls_last ordering), but the column itself required a
value until now. Existing arenas keep their coordinates unchanged.

Revision ID: c9f2d4a8b1e3
Revises: b3e8a5c1d7f4
Create Date: 2026-10-22
"""

from collections.abc import Sequence

from sqlalchemy import Numeric

from alembic import op

revision: str = "c9f2d4a8b1e3"
down_revision: str | None = "b3e8a5c1d7f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("arenas", "latitude", existing_type=Numeric(10, 7), nullable=True)
    op.alter_column("arenas", "longitude", existing_type=Numeric(10, 7), nullable=True)


def downgrade() -> None:
    # a NULL position cannot go back to NOT NULL without a value: an obvious, unmistakable
    # sentinel (0, 0 — the middle of the ocean, never inside Pakistan) rather than deleting
    # an owner's arena just because it has no pin.
    op.execute("UPDATE arenas SET latitude = 0, longitude = 0 WHERE latitude IS NULL")
    op.alter_column("arenas", "latitude", existing_type=Numeric(10, 7), nullable=False)
    op.alter_column("arenas", "longitude", existing_type=Numeric(10, 7), nullable=False)
