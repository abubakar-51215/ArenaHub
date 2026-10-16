"""matches.note: an optional line the creator adds ("Friendly game, all levels.")

Revision ID: c3f8a1b7e2d4
Revises: b9e2c4a6d1f3
Create Date: 2026-10-12 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3f8a1b7e2d4"
down_revision: str | None = "b9e2c4a6d1f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("note", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("matches", "note")
