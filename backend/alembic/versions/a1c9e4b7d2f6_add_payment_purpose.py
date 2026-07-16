"""add payment purpose

Adds ``payment_purpose`` enum + ``payments.purpose`` column to distinguish the
initial booking charge from a later balance top-up (e.g. paying the difference
after rescheduling to a pricier slot online). Existing rows are the initial
booking charge.

Revision ID: a1c9e4b7d2f6
Revises: f8a3b1e6c2d7
Create Date: 2026-07-17 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1c9e4b7d2f6"
down_revision: str | None = "f8a3b1e6c2d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    purpose = postgresql.ENUM("booking", "balance", name="payment_purpose")
    purpose.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "payments",
        sa.Column("purpose", purpose, nullable=False, server_default="booking"),
    )
    op.alter_column("payments", "purpose", server_default=None)


def downgrade() -> None:
    op.drop_column("payments", "purpose")
    postgresql.ENUM(name="payment_purpose").drop(op.get_bind(), checkfirst=True)
