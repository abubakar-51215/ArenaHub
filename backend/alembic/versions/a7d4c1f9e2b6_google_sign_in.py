"""Continue with Google: users.google_sub, and a phone that may wait for "One more step".

Revision ID: a7d4c1f9e2b6
Revises: e6c3a9d2b8f1
Create Date: 2026-10-14
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7d4c1f9e2b6"
down_revision: str | None = "e6c3a9d2b8f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])
    op.alter_column("users", "phone", existing_type=sa.String(length=20), nullable=True)


def downgrade() -> None:
    # an account still waiting for its phone cannot go back to the old rule
    op.execute("DELETE FROM users WHERE phone IS NULL")
    op.alter_column("users", "phone", existing_type=sa.String(length=20), nullable=False)
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "google_sub")
