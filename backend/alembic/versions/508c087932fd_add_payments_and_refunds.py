"""add payments and refunds

Adds payments (deviation #2 payment_method enum + payment_provider column +
receipt_proof_url) and refunds. One payment covers a whole booking checkout
group (payments.booking_group_id); refunds stay singular per booking row
(refunds.booking_id), matching docs/09 exactly, since a player can cancel
one slot out of a multi-slot booking independently.

Also adds bookings.qr_code_url (set once the payment module confirms a
booking) — bundled here since it's a one-column addition needed by this same
feature, not a separate module.

Revision ID: 508c087932fd
Revises: 85b4f21a41cb
Create Date: 2026-07-14 04:59:47.917418
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "508c087932fd"
down_revision: str | None = "85b4f21a41cb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payments",
        sa.Column("booking_group_id", sa.UUID(), nullable=False),
        sa.Column("player_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "payment_method",
            sa.Enum("card", "jazzcash", "easypaisa", "bank_transfer", name="payment_method"),
            nullable=False,
        ),
        sa.Column("payment_provider", sa.String(length=20), nullable=False),
        sa.Column("gateway_transaction_id", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pending", "completed", "failed", "refunded", name="payment_status"),
            nullable=False,
        ),
        sa.Column("payment_type", sa.Enum("full", "advance", name="payment_plan"), nullable=False),
        sa.Column("receipt_proof_url", sa.String(length=500), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["player_id"], ["users.id"], name=op.f("fk_payments_player_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
    )
    op.create_index(
        "ix_payments_booking_group_id", "payments", ["booking_group_id"], unique=False
    )
    op.create_index(
        op.f("ix_payments_gateway_transaction_id"),
        "payments",
        ["gateway_transaction_id"],
        unique=False,
    )
    op.create_index(op.f("ix_payments_player_id"), "payments", ["player_id"], unique=False)

    op.create_table(
        "refunds",
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("payment_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "processed", "failed", name="refund_status"),
            nullable=False,
        ),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name=op.f("fk_refunds_booking_id_bookings"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["payments.id"],
            name=op.f("fk_refunds_payment_id_payments"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refunds")),
    )
    op.create_index(op.f("ix_refunds_booking_id"), "refunds", ["booking_id"], unique=False)
    op.create_index(op.f("ix_refunds_payment_id"), "refunds", ["payment_id"], unique=False)

    op.add_column("bookings", sa.Column("qr_code_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "qr_code_url")
    op.drop_index(op.f("ix_refunds_payment_id"), table_name="refunds")
    op.drop_index(op.f("ix_refunds_booking_id"), table_name="refunds")
    op.drop_table("refunds")
    op.drop_index(op.f("ix_payments_player_id"), table_name="payments")
    op.drop_index(op.f("ix_payments_gateway_transaction_id"), table_name="payments")
    op.drop_index("ix_payments_booking_group_id", table_name="payments")
    op.drop_table("payments")
    # create_table doesn't auto-drop the Postgres ENUM types it implicitly
    # created (see the time_slots/bookings migrations for the same gap).
    sa.Enum(name="refund_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payment_plan").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payment_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="payment_method").drop(op.get_bind(), checkfirst=True)
