"""bookings.discount_code_id + discount_released_at: a discount use is reserved by
the booking that applied it, and given back (once) if that booking is never paid.

Revision ID: d5a9c2e7f1b3
Revises: c3f8a1b7e2d4
Create Date: 2026-10-13 23:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5a9c2e7f1b3"
down_revision: str | None = "c3f8a1b7e2d4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # old rows stay NULL: no code recorded, nothing to give back
    op.add_column("bookings", sa.Column("discount_code_id", sa.UUID(), nullable=True))
    op.add_column("bookings", sa.Column("discount_released_at", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_bookings_discount_code_id",
        "bookings",
        "discount_codes",
        ["discount_code_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bookings_discount_code_id", "bookings", ["discount_code_id"])


def downgrade() -> None:
    op.drop_index("ix_bookings_discount_code_id", table_name="bookings")
    op.drop_constraint("fk_bookings_discount_code_id", "bookings", type_="foreignkey")
    op.drop_column("bookings", "discount_released_at")
    op.drop_column("bookings", "discount_code_id")
