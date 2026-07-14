"""add bookings

Adds bookings — one row per booked time slot (docs/09_DATABASE_DESIGN.md),
grouped by booking_group_id for multi-slot checkouts. Payment processing
(webhook confirm, bank_transfer approval, refunds) lands with the payment
module next; this table starts every booking at pending_payment.

Revision ID: 85b4f21a41cb
Revises: 2c5389ea1313
Create Date: 2026-07-14 04:20:58.616566
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "85b4f21a41cb"
down_revision: str | None = "2c5389ea1313"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("court_id", sa.UUID(), nullable=False),
        sa.Column("slot_id", sa.UUID(), nullable=False),
        sa.Column("booking_group_id", sa.UUID(), nullable=False),
        sa.Column("booking_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("advance_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("remaining_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "payment_type",
            sa.Enum("full", "advance", name="booking_payment_plan"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum(
                "pending_payment",
                "pending_approval",
                "confirmed",
                "completed",
                "cancelled",
                "rejected",
                name="booking_status",
            ),
            nullable=False,
        ),
        sa.Column(
            "payment_status",
            sa.Enum("pending", "completed", "failed", "refunded", name="booking_payment_status"),
            nullable=False,
        ),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("refund_eligible", sa.Boolean(), nullable=False),
        sa.Column("refund_percentage", sa.Integer(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["arena_id"], ["arenas.id"], name=op.f("fk_bookings_arena_id_arenas"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["court_id"], ["courts.id"], name=op.f("fk_bookings_court_id_courts"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["player_id"], ["users.id"], name=op.f("fk_bookings_player_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["slot_id"],
            ["time_slots.id"],
            name=op.f("fk_bookings_slot_id_time_slots"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bookings")),
    )
    op.create_index("ix_bookings_arena_id_status", "bookings", ["arena_id", "status"], unique=False)
    op.create_index(
        "ix_bookings_booking_group_id", "bookings", ["booking_group_id"], unique=False
    )
    op.create_index(op.f("ix_bookings_player_id"), "bookings", ["player_id"], unique=False)
    op.create_index(
        "ix_bookings_player_id_status", "bookings", ["player_id", "status"], unique=False
    )
    op.create_index(op.f("ix_bookings_status"), "bookings", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bookings_status"), table_name="bookings")
    op.drop_index("ix_bookings_player_id_status", table_name="bookings")
    op.drop_index(op.f("ix_bookings_player_id"), table_name="bookings")
    op.drop_index("ix_bookings_booking_group_id", table_name="bookings")
    op.drop_index("ix_bookings_arena_id_status", table_name="bookings")
    op.drop_table("bookings")
    # create_table doesn't auto-drop the Postgres ENUM types it implicitly
    # created (see the time_slots migration for the same gap) — drop all
    # three explicitly so a re-upgrade after downgrade doesn't fail on
    # "type already exists".
    sa.Enum(name="booking_payment_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="booking_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="booking_payment_plan").drop(op.get_bind(), checkfirst=True)
