"""arena bank details multi-account

Lets an arena hold several bank-transfer receiving accounts: drops the
one-row-per-arena unique constraint and adds ``label``, ``is_default``, and
``is_active``. Any pre-existing single account is marked the default.

Revision ID: f8a3b1e6c2d7
Revises: e7f1a2c9d3b4
Create Date: 2026-07-17 11:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a3b1e6c2d7"
down_revision: str | None = "e7f1a2c9d3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "arena_bank_details", sa.Column("label", sa.String(length=100), nullable=True)
    )
    op.add_column(
        "arena_bank_details",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "arena_bank_details",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.drop_constraint("uq_arena_bank_details_arena_id", "arena_bank_details", type_="unique")
    # Any account that existed under the old one-per-arena model becomes the
    # arena's default.
    op.execute("UPDATE arena_bank_details SET is_default = true")
    op.alter_column("arena_bank_details", "is_default", server_default=None)
    op.alter_column("arena_bank_details", "is_active", server_default=None)


def downgrade() -> None:
    # Keep only one account per arena (the default, else an arbitrary one) so
    # the unique constraint can be restored.
    op.execute(
        """
        DELETE FROM arena_bank_details a
        USING arena_bank_details b
        WHERE a.arena_id = b.arena_id
          AND (b.is_default AND NOT a.is_default
               OR (a.is_default = b.is_default AND a.id > b.id))
        """
    )
    op.create_unique_constraint(
        "uq_arena_bank_details_arena_id", "arena_bank_details", ["arena_id"]
    )
    op.drop_column("arena_bank_details", "is_active")
    op.drop_column("arena_bank_details", "is_default")
    op.drop_column("arena_bank_details", "label")
