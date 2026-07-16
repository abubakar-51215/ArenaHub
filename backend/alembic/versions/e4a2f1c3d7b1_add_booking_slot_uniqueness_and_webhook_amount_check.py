"""add booking slot uniqueness and webhook amount verification

Adds a partial unique index to enforce one active booking per slot at the
database level, backing the Redis lock, and leaves cancelled/rejected
history rows untouched.

Revision ID: e4a2f1c3d7b1
Revises: f9c9376613cc
Create Date: 2026-07-16 16:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4a2f1c3d7b1"
down_revision: str | None = "f9c9376613cc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "uq_bookings_active_slot_id",
        "bookings",
        ["slot_id"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('cancelled', 'rejected')"),
    )


def downgrade() -> None:
    op.drop_index("uq_bookings_active_slot_id", table_name="bookings")