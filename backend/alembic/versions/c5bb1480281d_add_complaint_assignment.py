"""add complaint assignment

Adds complaints.assigned_to (nullable FK to users.id, SET NULL) — auto-set to
whichever admin first responds (PROJECT_GUIDELINES deviation #23).

Revision ID: c5bb1480281d
Revises: daa64a3866e6
Create Date: 2026-07-16 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5bb1480281d"
down_revision: str | None = "daa64a3866e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("complaints", sa.Column("assigned_to", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_complaints_assigned_to_users"),
        "complaints",
        "users",
        ["assigned_to"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_complaints_assigned_to_users"), "complaints", type_="foreignkey")
    op.drop_column("complaints", "assigned_to")
