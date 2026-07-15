"""add arena likes

Adds arena_likes — a player's "liked arena" bookmarks (FR-P-12, doc 10's
like endpoints). Unique per (player, arena).

Revision ID: b72d9fb46365
Revises: c5bb1480281d
Create Date: 2026-07-16 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b72d9fb46365"
down_revision: str | None = "c5bb1480281d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "arena_likes",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["player_id"], ["users.id"], name=op.f("fk_arena_likes_player_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["arena_id"], ["arenas.id"], name=op.f("fk_arena_likes_arena_id_arenas"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_arena_likes")),
        sa.UniqueConstraint("player_id", "arena_id", name="uq_arena_likes_player_id_arena_id"),
    )
    op.create_index(op.f("ix_arena_likes_player_id"), "arena_likes", ["player_id"], unique=False)
    op.create_index(op.f("ix_arena_likes_arena_id"), "arena_likes", ["arena_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_arena_likes_arena_id"), table_name="arena_likes")
    op.drop_index(op.f("ix_arena_likes_player_id"), table_name="arena_likes")
    op.drop_table("arena_likes")
