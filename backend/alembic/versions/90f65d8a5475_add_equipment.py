"""add equipment

Adds equipment (rentable items an arena offers) and booking_equipment (the
addon lines a booking actually rented) — docs/09_DATABASE_DESIGN.md. No enum
columns here, so no ENUM-type reversibility gap to work around this time.

Revision ID: 90f65d8a5475
Revises: 508c087932fd
Create Date: 2026-07-14 05:59:36.980218
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "90f65d8a5475"
down_revision: str | None = "508c087932fd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "equipment",
        sa.Column("arena_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rental_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("quantity_total", sa.Integer(), nullable=False),
        sa.Column("quantity_available", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["arena_id"], ["arenas.id"], name=op.f("fk_equipment_arena_id_arenas"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_equipment")),
    )
    op.create_index(op.f("ix_equipment_arena_id"), "equipment", ["arena_id"], unique=False)
    op.create_index(op.f("ix_equipment_is_active"), "equipment", ["is_active"], unique=False)

    op.create_table(
        "booking_equipment",
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("equipment_id", sa.UUID(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("total_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_booking_equipment_booking_id_bookings"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["equipment_id"],
            ["equipment.id"],
            name=op.f("fk_booking_equipment_equipment_id_equipment"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_booking_equipment")),
    )
    op.create_index(
        op.f("ix_booking_equipment_booking_id"), "booking_equipment", ["booking_id"], unique=False
    )
    op.create_index(
        op.f("ix_booking_equipment_equipment_id"),
        "booking_equipment",
        ["equipment_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_booking_equipment_equipment_id"), table_name="booking_equipment")
    op.drop_index(op.f("ix_booking_equipment_booking_id"), table_name="booking_equipment")
    op.drop_table("booking_equipment")
    op.drop_index(op.f("ix_equipment_is_active"), table_name="equipment")
    op.drop_index(op.f("ix_equipment_arena_id"), table_name="equipment")
    op.drop_table("equipment")
