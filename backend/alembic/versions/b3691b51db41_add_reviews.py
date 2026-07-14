"""add reviews

Adds reviews (a player's rating + optional text on a completed booking) —
docs/09_DATABASE_DESIGN.md section 14, plus owner-response and report/flag
fields from MASTER_DEVELOPMENT_PLAN.md's Track B review-module scope. No
enum columns here (``rating`` is a plain integer with a CHECK constraint), so
no ENUM-type reversibility gap to work around this time.

Revision ID: b3691b51db41
Revises: 90f65d8a5475
Create Date: 2026-07-14 07:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3691b51db41"
down_revision: str | None = "90f65d8a5475"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review_text", sa.Text(), nullable=True),
        sa.Column("owner_response", sa.Text(), nullable=True),
        sa.Column("owner_response_at", sa.DateTime(), nullable=True),
        sa.Column("is_flagged", sa.Boolean(), nullable=False),
        sa.Column("flag_reason", sa.Text(), nullable=True),
        sa.Column("flagged_by", sa.UUID(), nullable=True),
        sa.Column("flagged_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name=op.f("ck_reviews_rating_range")),
        sa.ForeignKeyConstraint(
            ["player_id"], ["users.id"], name=op.f("fk_reviews_player_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["arena_id"], ["arenas.id"], name=op.f("fk_reviews_arena_id_arenas"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_reviews_booking_id_bookings"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["flagged_by"], ["users.id"], name=op.f("fk_reviews_flagged_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
        sa.UniqueConstraint("booking_id", name=op.f("uq_reviews_booking_id")),
    )
    op.create_index(op.f("ix_reviews_player_id"), "reviews", ["player_id"], unique=False)
    op.create_index(op.f("ix_reviews_arena_id"), "reviews", ["arena_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_reviews_arena_id"), table_name="reviews")
    op.drop_index(op.f("ix_reviews_player_id"), table_name="reviews")
    op.drop_table("reviews")
