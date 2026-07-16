"""add arena bank details

Adds ``arena_bank_details``, the owner-set receiving-account details shown to
players at checkout for the manual ``bank_transfer`` payment method (docs/06,
docs/11). One row per arena.

Revision ID: d2e5a917c4b0
Revises: cc641b731b7d
Create Date: 2026-07-16 22:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e5a917c4b0"
down_revision: str | None = "cc641b731b7d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "arena_bank_details",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("arena_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=False),
        sa.Column("account_title", sa.String(length=150), nullable=False),
        sa.Column("account_number", sa.String(length=50), nullable=False),
        sa.Column("iban", sa.String(length=50), nullable=True),
        sa.Column("branch_code", sa.String(length=30), nullable=True),
        sa.Column("swift_code", sa.String(length=30), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["arena_id"], ["arenas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("arena_id", name="uq_arena_bank_details_arena_id"),
    )
    op.create_index(
        op.f("ix_arena_bank_details_arena_id"), "arena_bank_details", ["arena_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_arena_bank_details_arena_id"), table_name="arena_bank_details")
    op.drop_table("arena_bank_details")
