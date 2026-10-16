"""G6: a match is tied to a booking group; "Rate your last game" is sent once per booking

- matches.booking_group_id: the creator's confirmed booking the match is on (NULL for matches made before this),
  and a partial unique index so a booking group has at most one open or full match.
- bookings.rate_prompt_sent_at: set when the "Rate your last game" notice was sent, so it goes out once.

Revision ID: b9e2c4a6d1f3
Revises: a7c3e9d1b5f2
Create Date: 2026-10-12 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b9e2c4a6d1f3"
down_revision: str | None = "a7c3e9d1b5f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "matches", sa.Column("booking_group_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_index(
        "uq_matches_one_live_match_per_booking",
        "matches",
        ["booking_group_id"],
        unique=True,
        postgresql_where=sa.text("booking_group_id IS NOT NULL AND status IN ('open', 'full')"),
    )
    op.add_column("bookings", sa.Column("rate_prompt_sent_at", sa.DateTime(), nullable=True))
    # bookings that were completed before this release get no "rate your game" notice
    op.execute("UPDATE bookings SET rate_prompt_sent_at = now() WHERE status = 'completed'")


def downgrade() -> None:
    op.drop_column("bookings", "rate_prompt_sent_at")
    op.drop_index("uq_matches_one_live_match_per_booking", table_name="matches")
    op.drop_column("matches", "booking_group_id")
