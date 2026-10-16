"""add otp purpose

Adds ``otp_verifications.purpose`` so every OTP lookup can filter by what the
code was issued for (registration, password_reset, password_change,
phone_change, email_change). Before this, one table of codes served every flow
and the latest unused code was accepted by whichever flow asked first.

Rows that already exist get the purpose ``legacy``, which no flow looks up, so
a code issued before this migration cannot complete any flow. They are at most
ten minutes from expiry; a user with a code in flight just requests a new one.
The column has no default afterwards, so new rows must name their purpose.

Revision ID: b7d2f4a9c1e3
Revises: a1c9e4b7d2f6
Create Date: 2026-10-05 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d2f4a9c1e3"
down_revision: str | None = "a1c9e4b7d2f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "otp_verifications",
        sa.Column("purpose", sa.String(length=20), nullable=False, server_default="legacy"),
    )
    op.alter_column("otp_verifications", "purpose", server_default=None)


def downgrade() -> None:
    op.drop_column("otp_verifications", "purpose")
