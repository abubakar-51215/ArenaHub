"""Add bookings.pass_token: a random, unguessable value the QR carries instead of
the booking's own id (item 6B). Existing confirmed bookings keep their old QR
(still readable, just names nothing useful) until next regenerated; nothing
reads the old payload any more.

Revision ID: d1a6f3b9c4e8
Revises: c9f2d4a8b1e3
Create Date: 2026-10-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d1a6f3b9c4e8"
down_revision: str | None = "c9f2d4a8b1e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("pass_token", sa.String(length=64), nullable=True))
    op.create_index("uq_bookings_pass_token", "bookings", ["pass_token"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_bookings_pass_token", table_name="bookings")
    op.drop_column("bookings", "pass_token")
