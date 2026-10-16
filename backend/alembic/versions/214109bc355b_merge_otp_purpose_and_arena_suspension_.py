"""merge otp purpose and arena suspension heads

Joins the two branches that both start at a1c9e4b7d2f6: the OTP purpose
column (b7d2f4a9c1e3) and arena suspension / soft delete / refund retry
(c5e8a1d4f2b9). No schema change of its own; it gives Alembic one head.

Revision ID: 214109bc355b
Revises: b7d2f4a9c1e3, c5e8a1d4f2b9
Create Date: 2026-10-09 11:19:06.690685
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "214109bc355b"
down_revision: str | Sequence[str] | None = ("b7d2f4a9c1e3", "c5e8a1d4f2b9")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
