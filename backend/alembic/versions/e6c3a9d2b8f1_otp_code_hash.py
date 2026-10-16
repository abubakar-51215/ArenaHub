"""otp_verifications keeps only a keyed hash of each code (code_hash), when it was used or
ended (used_at), and whether its email failed to send (delivery_failed). The plain code column
goes; old unused plain codes are deleted (they expire within minutes anyway).

Revision ID: e6c3a9d2b8f1
Revises: d5a9c2e7f1b3
Create Date: 2026-10-14 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6c3a9d2b8f1"
down_revision: str | None = "d5a9c2e7f1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DELETE FROM otp_verifications")
    op.add_column("otp_verifications", sa.Column("code_hash", sa.String(64), nullable=False))
    op.add_column(
        "otp_verifications", sa.Column("used_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "otp_verifications",
        sa.Column("delivery_failed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.drop_column("otp_verifications", "code")
    op.drop_column("otp_verifications", "is_used")


def downgrade() -> None:
    op.execute("DELETE FROM otp_verifications")
    op.add_column(
        "otp_verifications",
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("otp_verifications", sa.Column("code", sa.String(6), nullable=False))
    op.drop_column("otp_verifications", "delivery_failed")
    op.drop_column("otp_verifications", "used_at")
    op.drop_column("otp_verifications", "code_hash")
