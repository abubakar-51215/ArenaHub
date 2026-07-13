"""add pricing and discounts

Adds Track B (Sprint 2) pricing/verification surface:
* arenas.refund_policy (JSONB) — cancellation refund tiers.
* courts.description / courts.images — court presentation.
* discount_codes — per-arena promo codes (+ discount_type enum).
* court_pricing_rules — peak-pricing windows.

Revision ID: 7c1e9a4b2d10
Revises: f3dc8c5b1963
Create Date: 2026-07-13 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "7c1e9a4b2d10"
down_revision: str | None = "f3dc8c5b1963"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False so we control the enum lifecycle explicitly (create before
# use, drop on downgrade) — create_table/drop_table alone would leave it behind.
discount_type = postgresql.ENUM("percentage", "fixed", name="discount_type", create_type=False)


def upgrade() -> None:
    # Backfillable NOT NULL columns on existing rows via server_default.
    op.add_column(
        "arenas",
        sa.Column(
            "refund_policy",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("courts", sa.Column("description", sa.Text(), nullable=True))
    op.add_column(
        "courts",
        sa.Column(
            "images",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    discount_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "discount_codes",
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("discount_type", discount_type, nullable=False),
        sa.Column("discount_value", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "min_booking_amount",
            sa.Numeric(precision=10, scale=2),
            nullable=False,
            server_default=sa.text("'0'"),
        ),
        sa.Column("max_uses", sa.Integer(), nullable=True),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default=sa.text("'0'")),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["arena_id"],
            ["arenas.id"],
            name=op.f("fk_discount_codes_arena_id_arenas"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_discount_codes")),
        sa.UniqueConstraint("arena_id", "code", name="uq_discount_codes_arena_id_code"),
    )
    op.create_index(
        op.f("ix_discount_codes_arena_id"), "discount_codes", ["arena_id"], unique=False
    )

    op.create_table(
        "court_pricing_rules",
        sa.Column("court_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("weekday", sa.SmallInteger(), nullable=True),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column(
            "price_multiplier",
            sa.Numeric(precision=4, scale=2),
            nullable=False,
            server_default=sa.text("'1.00'"),
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["court_id"],
            ["courts.id"],
            name=op.f("fk_court_pricing_rules_court_id_courts"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_court_pricing_rules")),
    )
    op.create_index(
        op.f("ix_court_pricing_rules_court_id"),
        "court_pricing_rules",
        ["court_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_court_pricing_rules_court_id"), table_name="court_pricing_rules")
    op.drop_table("court_pricing_rules")
    op.drop_index(op.f("ix_discount_codes_arena_id"), table_name="discount_codes")
    op.drop_table("discount_codes")
    discount_type.drop(op.get_bind(), checkfirst=True)
    op.drop_column("courts", "images")
    op.drop_column("courts", "description")
    op.drop_column("arenas", "refund_policy")
