"""arena suspension, soft delete and refund retry

Admins can suspend, reactivate and soft-delete an arena. These columns are
written only by the admin endpoints; the owner's own update and active
toggle never touch them, so an owner cannot undo a suspension.

- arenas.suspended_at / suspended_reason / suspended_by: set while suspended
- arenas.deleted_at / deleted_reason / deleted_by: soft delete (the row and
  its bookings, payments, refunds, reviews and audit rows stay)
- refunds.gateway_attempts / next_attempt_at / last_error / needs_manual:
  a refund the payment gateway could not complete stays pending and is
  retried by the scheduler with a growing delay; after the last try it is
  flagged for manual handling. Manual (bank-transfer) refunds never get a
  next_attempt_at, so they are never retried automatically.

Branches from the committed head a1c9e4b7d2f6. The parked OTP migration
(b7d2f4a9c1e3) branches from the same revision, so a working tree that has
both shows two heads: upgrade with ``alembic upgrade heads`` until that work
lands with a merge revision.

Revision ID: c5e8a1d4f2b9
Revises: a1c9e4b7d2f6
Create Date: 2026-10-08 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c5e8a1d4f2b9"
down_revision: str | None = "a1c9e4b7d2f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("arenas", sa.Column("suspended_at", sa.DateTime(), nullable=True))
    op.add_column("arenas", sa.Column("suspended_reason", sa.Text(), nullable=True))
    op.add_column(
        "arenas",
        sa.Column(
            "suspended_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("arenas", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column("arenas", sa.Column("deleted_reason", sa.Text(), nullable=True))
    op.add_column(
        "arenas",
        sa.Column(
            "deleted_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.add_column(
        "refunds",
        sa.Column("gateway_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("refunds", sa.Column("next_attempt_at", sa.DateTime(), nullable=True))
    op.add_column("refunds", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column(
        "refunds",
        sa.Column("needs_manual", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # the retry job looks up due refunds by this column
    op.create_index("ix_refunds_next_attempt_at", "refunds", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_index("ix_refunds_next_attempt_at", table_name="refunds")
    op.drop_column("refunds", "needs_manual")
    op.drop_column("refunds", "last_error")
    op.drop_column("refunds", "next_attempt_at")
    op.drop_column("refunds", "gateway_attempts")
    op.drop_column("arenas", "deleted_by")
    op.drop_column("arenas", "deleted_reason")
    op.drop_column("arenas", "deleted_at")
    op.drop_column("arenas", "suspended_by")
    op.drop_column("arenas", "suspended_reason")
    op.drop_column("arenas", "suspended_at")
