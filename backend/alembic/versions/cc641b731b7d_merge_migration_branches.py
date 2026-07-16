"""merge migration branches

Revision ID: cc641b731b7d
Revises: b1c4d8e6f2a3, b72d9fb46365
Create Date: 2026-07-16 21:10:13.517055
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "cc641b731b7d"
down_revision: str | Sequence[str] | None = ("b1c4d8e6f2a3", "b72d9fb46365")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
