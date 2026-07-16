"""add numeric check constraints and match capacity trigger

Adds database-level CHECK constraints for the monetary/count fields that are
already validated in application code, plus a trigger that enforces
``match_participants`` never exceeds ``matches.max_players``.

Revision ID: a9b3d47f2f11
Revises: e4a2f1c3d7b1
Create Date: 2026-07-16 17:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b3d47f2f11"
down_revision: str | None = "e4a2f1c3d7b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint("ck_payments_amount_positive", "payments", "amount > 0")
    op.create_check_constraint("ck_refunds_amount_nonneg", "refunds", "amount >= 0")
    op.create_check_constraint(
        "ck_bookings_total_amount_positive", "bookings", "total_amount > 0"
    )
    op.create_check_constraint(
        "ck_bookings_advance_amount_nonneg", "bookings", "advance_amount >= 0"
    )
    op.create_check_constraint(
        "ck_bookings_remaining_amount_nonneg", "bookings", "remaining_amount >= 0"
    )
    op.create_check_constraint("ck_courts_base_price_positive", "courts", "base_price > 0")
    op.create_check_constraint(
        "ck_court_pricing_rules_multiplier_positive",
        "court_pricing_rules",
        "price_multiplier > 0",
    )
    op.create_check_constraint(
        "ck_court_pricing_rules_time_order", "court_pricing_rules", "end_time > start_time"
    )
    op.create_check_constraint(
        "ck_equipment_rental_price_positive", "equipment", "rental_price > 0"
    )
    op.create_check_constraint(
        "ck_equipment_quantity_total_nonneg", "equipment", "quantity_total >= 0"
    )
    op.create_check_constraint(
        "ck_equipment_quantity_available_nonneg", "equipment", "quantity_available >= 0"
    )
    op.create_check_constraint(
        "ck_equipment_quantity_available_within_total",
        "equipment",
        "quantity_available <= quantity_total",
    )
    op.create_check_constraint("ck_matches_max_players_positive", "matches", "max_players > 0")
    op.create_check_constraint(
        "ck_discount_codes_discount_value_positive",
        "discount_codes",
        "discount_value > 0",
    )
    op.create_check_constraint(
        "ck_discount_codes_percentage_max_100",
        "discount_codes",
        "discount_type != 'percentage' OR discount_value <= 100",
    )
    op.create_check_constraint(
        "ck_discount_codes_min_booking_amount_nonneg",
        "discount_codes",
        "min_booking_amount >= 0",
    )
    op.create_check_constraint(
        "ck_discount_codes_used_count_nonneg", "discount_codes", "used_count >= 0"
    )
    op.create_check_constraint(
        "ck_discount_codes_used_count_within_max_uses",
        "discount_codes",
        "max_uses IS NULL OR used_count <= max_uses",
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION enforce_match_capacity()
        RETURNS trigger AS $$
        DECLARE
            participant_count integer;
            max_allowed integer;
        BEGIN
            SELECT COUNT(*) INTO participant_count
            FROM match_participants
            WHERE match_id = NEW.match_id;

            SELECT max_players INTO max_allowed
            FROM matches
            WHERE id = NEW.match_id
            FOR UPDATE;

            IF max_allowed IS NULL THEN
                RAISE EXCEPTION 'Match not found';
            END IF;

            IF participant_count >= max_allowed THEN
                RAISE EXCEPTION 'Match is full';
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_match_capacity ON match_participants;")
    op.execute(
        """
        CREATE TRIGGER trg_enforce_match_capacity
        BEFORE INSERT ON match_participants
        FOR EACH ROW
        EXECUTE FUNCTION enforce_match_capacity();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_enforce_match_capacity ON match_participants;")
    op.execute("DROP FUNCTION IF EXISTS enforce_match_capacity();")
    op.drop_constraint("ck_discount_codes_used_count_within_max_uses", "discount_codes", type_="check")
    op.drop_constraint("ck_discount_codes_used_count_nonneg", "discount_codes", type_="check")
    op.drop_constraint("ck_discount_codes_min_booking_amount_nonneg", "discount_codes", type_="check")
    op.drop_constraint("ck_discount_codes_percentage_max_100", "discount_codes", type_="check")
    op.drop_constraint("ck_discount_codes_discount_value_positive", "discount_codes", type_="check")
    op.drop_constraint("ck_matches_max_players_positive", "matches", type_="check")
    op.drop_constraint("ck_equipment_quantity_available_within_total", "equipment", type_="check")
    op.drop_constraint("ck_equipment_quantity_available_nonneg", "equipment", type_="check")
    op.drop_constraint("ck_equipment_quantity_total_nonneg", "equipment", type_="check")
    op.drop_constraint("ck_equipment_rental_price_positive", "equipment", type_="check")
    op.drop_constraint("ck_court_pricing_rules_time_order", "court_pricing_rules", type_="check")
    op.drop_constraint(
        "ck_court_pricing_rules_multiplier_positive", "court_pricing_rules", type_="check"
    )
    op.drop_constraint("ck_courts_base_price_positive", "courts", type_="check")
    op.drop_constraint("ck_bookings_remaining_amount_nonneg", "bookings", type_="check")
    op.drop_constraint("ck_bookings_advance_amount_nonneg", "bookings", type_="check")
    op.drop_constraint("ck_bookings_total_amount_positive", "bookings", type_="check")
    op.drop_constraint("ck_refunds_amount_nonneg", "refunds", type_="check")
    op.drop_constraint("ck_payments_amount_positive", "payments", type_="check")