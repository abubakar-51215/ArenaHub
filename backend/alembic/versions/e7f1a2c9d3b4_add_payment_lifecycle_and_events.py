"""add payment lifecycle status and audit events

Adds the fine-grained ``payment_lifecycle_status`` enum + ``lifecycle_status``
column on ``payments`` (tracked alongside the coarse ``status``), and the
append-only ``payment_events`` audit table. Backfills existing payments'
lifecycle from their coarse status.

Revision ID: e7f1a2c9d3b4
Revises: d2e5a917c4b0
Create Date: 2026-07-17 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e7f1a2c9d3b4"
down_revision: str | None = "d2e5a917c4b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_LIFECYCLE = (
    "pending",
    "initiated",
    "processing",
    "pending_approval",
    "paid",
    "confirmed",
    "failed",
    "expired",
    "rejected",
    "refunded",
)


def upgrade() -> None:
    lifecycle = postgresql.ENUM(*_LIFECYCLE, name="payment_lifecycle_status")
    lifecycle.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "payments",
        sa.Column(
            "lifecycle_status",
            lifecycle,
            nullable=False,
            server_default="pending",
        ),
    )
    # Backfill existing rows so the fine-grained view is consistent with the
    # coarse status they already carry.
    op.execute("UPDATE payments SET lifecycle_status = 'confirmed' WHERE status = 'completed'")
    op.execute("UPDATE payments SET lifecycle_status = 'failed' WHERE status = 'failed'")
    op.execute("UPDATE payments SET lifecycle_status = 'refunded' WHERE status = 'refunded'")
    # Drop the server_default now that it's only needed for the backfill; the
    # ORM supplies the default on insert.
    op.alter_column("payments", "lifecycle_status", server_default=None)

    op.create_table(
        "payment_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "from_status",
            postgresql.ENUM(*_LIFECYCLE, name="payment_lifecycle_status", create_type=False),
            nullable=True,
        ),
        sa.Column(
            "to_status",
            postgresql.ENUM(*_LIFECYCLE, name="payment_lifecycle_status", create_type=False),
            nullable=False,
        ),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_payment_events_payment_id"), "payment_events", ["payment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_events_payment_id"), table_name="payment_events")
    op.drop_table("payment_events")
    op.drop_column("payments", "lifecycle_status")
    postgresql.ENUM(name="payment_lifecycle_status").drop(op.get_bind(), checkfirst=True)
