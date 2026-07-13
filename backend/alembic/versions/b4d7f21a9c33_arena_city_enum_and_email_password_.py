"""arena city enum, pending_email + pending_password_hash columns

Revision ID: b4d7f21a9c33
Revises: 9f3a6b5c8e21
Create Date: 2026-07-13 00:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b4d7f21a9c33"
down_revision: str | None = "9f3a6b5c8e21"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CITY_ENUM = sa.Enum("Lahore", "Islamabad", "Karachi", "Multan", name="arena_city")


def upgrade() -> None:
    _CITY_ENUM.create(op.get_bind(), checkfirst=True)
    op.execute(
        "ALTER TABLE arenas ALTER COLUMN city TYPE arena_city USING city::text::arena_city"
    )
    op.add_column("users", sa.Column("pending_email", sa.String(length=255), nullable=True))
    op.add_column(
        "users", sa.Column("pending_password_hash", sa.String(length=255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "pending_password_hash")
    op.drop_column("users", "pending_email")
    op.execute("ALTER TABLE arenas ALTER COLUMN city TYPE VARCHAR(100) USING city::text")
    _CITY_ENUM.drop(op.get_bind(), checkfirst=True)
