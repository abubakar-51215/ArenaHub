"""add blocked dates

Adds arena_blocked_dates — calendar days on which an arena takes no bookings.
Unique per (arena, date) so a day can't be double-blocked.

Revision ID: 9f3a6b5c8e21
Revises: 7c1e9a4b2d10
Create Date: 2026-07-13 12:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9f3a6b5c8e21"
down_revision: str | None = "7c1e9a4b2d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "arena_blocked_dates",
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("blocked_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["arena_id"],
            ["arenas.id"],
            name=op.f("fk_arena_blocked_dates_arena_id_arenas"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_arena_blocked_dates")),
        sa.UniqueConstraint(
            "arena_id", "blocked_date", name="uq_arena_blocked_dates_arena_id_date"
        ),
    )
    op.create_index(
        op.f("ix_arena_blocked_dates_arena_id"),
        "arena_blocked_dates",
        ["arena_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_arena_blocked_dates_arena_id"), table_name="arena_blocked_dates")
    op.drop_table("arena_blocked_dates")
