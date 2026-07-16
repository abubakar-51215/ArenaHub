"""add booking reminder sent columns

Adds ``reminder_24h_sent_at``/``reminder_1h_sent_at`` to ``bookings`` so the
reminder scheduler can tell a reminder was already sent instead of relying on
the run-interval/tolerance window alone (a delayed or re-run tick could
otherwise send the same reminder twice).

Revision ID: b1c4d8e6f2a3
Revises: a9b3d47f2f11
Create Date: 2026-07-16 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c4d8e6f2a3"
down_revision: str | None = "a9b3d47f2f11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bookings", sa.Column("reminder_24h_sent_at", sa.DateTime(), nullable=True))
    op.add_column("bookings", sa.Column("reminder_1h_sent_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "reminder_1h_sent_at")
    op.drop_column("bookings", "reminder_24h_sent_at")
