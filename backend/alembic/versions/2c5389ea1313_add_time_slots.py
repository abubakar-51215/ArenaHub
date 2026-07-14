"""add time slots

Adds time_slots — one row per bookable hour on a court, generated from the
parent arena's operating_hours. Unique per (court, date, start_time) so a
slot can't be double-generated; the booking module (next) locks and books
individual rows.

Revision ID: 2c5389ea1313
Revises: b4d7f21a9c33
Create Date: 2026-07-14 03:55:44.139677
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2c5389ea1313"
down_revision: str | None = "b4d7f21a9c33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "time_slots",
        sa.Column("court_id", sa.UUID(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("available", "reserved", "booked", "maintenance", name="slot_status"),
            nullable=False,
        ),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["court_id"],
            ["courts.id"],
            name=op.f("fk_time_slots_court_id_courts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_time_slots")),
        sa.UniqueConstraint("court_id", "date", "start_time", name="uq_time_slots_court_date_start"),
    )
    op.create_index(op.f("ix_time_slots_court_id"), "time_slots", ["court_id"], unique=False)
    op.create_index("ix_time_slots_court_id_date", "time_slots", ["court_id", "date"], unique=False)
    op.create_index(op.f("ix_time_slots_status"), "time_slots", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_time_slots_status"), table_name="time_slots")
    op.drop_index("ix_time_slots_court_id_date", table_name="time_slots")
    op.drop_index(op.f("ix_time_slots_court_id"), table_name="time_slots")
    op.drop_table("time_slots")
    # create_table doesn't auto-drop the Postgres ENUM type it implicitly
    # created, so a re-upgrade after downgrade would fail on "type already
    # exists" without this.
    sa.Enum(name="slot_status").drop(op.get_bind(), checkfirst=True)
