"""refunds.processed_by: who marked a bank-transfer refund as paid

Revision ID: a7c3e9d1b5f2
Revises: 214109bc355b
Create Date: 2026-10-11 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7c3e9d1b5f2"
down_revision: str | None = "214109bc355b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "refunds",
        sa.Column(
            "processed_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("refunds", "processed_by")
