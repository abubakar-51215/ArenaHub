"""Notice wording: money, dates, times and sport names read like the app, in every template,
and one event makes one notice."""

import re
from datetime import UTC, date, datetime, time
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notification.model import Notification
from app.modules.notification.service import EVENT_META, render
from app.shared.display import karachi_date, karachi_datetime, rupees, sport_name, time_12h
from tests.helpers import auth_header, make_user
from tests.modules.test_match import _post, _setup

BID = "5bc260d9-4599-4bcc-89f4-ae487b43187f"
MATCH = {
    "arena_name": "Goal Line Arena",
    "match_date": "2026-10-13",
    "match_time": "19:00:00",
}

# What each caller really sends: raw values (ids as text, amounts as text, ISO dates, sport keys).
RAW: dict[str, dict[str, object]] = {
    "booking_confirmed": {"booking_id": BID},
    "booking_cancelled": {"booking_id": BID},
    "booking_payment_failed": {"booking_id": BID},
    "receipt_rejected": {
        "booking_id": BID,
        "booking_code": "AHB-6766BD",
        "arena_name": "Kickoff Arena",
        "reason": "The amount does not match.",
    },
    "booking_reminder_24h": {"booking_id": BID},
    "booking_reminder_1h": {"booking_id": BID},
    "new_confirmed_booking": {"count": 3},
    "refund_initiated": {"booking_id": BID, "amount": "2000.00"},
    "balance_paid": {"booking_id": BID},
    "account_suspended": {"reason": "Reported for abusive behavior."},
    "account_reactivated": {},
    "arena_suspended": {"arena_name": "Goal Line Arena", "reason": "Safety check."},
    "arena_reactivated": {"arena_name": "Goal Line Arena"},
    "arena_deleted": {"arena_name": "Goal Line Arena", "reason": "Closed."},
    "refund_completed": {"booking_id": BID, "amount": "3000.00"},
    "payment_reminder": {
        "arena_name": "Goal Line Arena",
        "court_name": "Court 1",
        "slot": "Tue 13 Oct, 7:00 PM - 8:00 PM",
    },
    "complaint_reply": {"complaint_id": "86cb83ec-8293-445e-8f1a-05e69ed97a1a"},
    "rate_your_game": {"arena_name": "Goal Line Arena", "booking_id": BID},
    "match_joined": {"player_name": "Sara", "sport": "futsal", **MATCH},
    "match_left": {"player_name": "Sara", "sport": "football", **MATCH},
    "match_cancelled": {"sport": "table_tennis", **MATCH},
    "match_full": {"sport": "futsal", **MATCH},
    "refund_to_send": {
        "player_name": "Ayesha",
        "arena_name": "Goal Line Arena",
        "amount": "2500.50",
    },
    "refund_needs_manual": {"booking_id": BID, "amount": "2000.00"},
    "arena_waiting": {"arena_name": "Kickoff Arena"},
    "complaint_new": {"player_name": "Ayesha Siddiqui"},
    "arena_approved": {"arena_name": "Kickoff Arena"},
    "arena_rejected": {"arena_name": "Net Zone", "reason": "Photos are missing."},
}


def test_rupees_look_like_the_app() -> None:
    assert rupees("2000.00") == "₨ 2,000"
    assert rupees(Decimal("2000")) == "₨ 2,000"
    assert rupees("1234567.00") == "₨ 1,234,567"
    assert rupees("2500.50") == "₨ 2,500.50"
    assert rupees(0) == "₨ 0"
    assert rupees("500") == "₨ 500"


def test_dates_and_times_are_written_for_people_in_karachi() -> None:
    assert karachi_date(date(2026, 10, 13)) == "Tue 13 Oct"
    assert karachi_date("2026-10-05") == "Mon 5 Oct"
    assert time_12h(time(19, 0)) == "7:00 PM"
    assert time_12h("08:30:00") == "8:30 AM"
    assert time_12h(time(0, 5)) == "12:05 AM"
    assert time_12h(time(12, 0)) == "12:00 PM"
    # stored in UTC, moved to Karachi (UTC+5): 21:30 UTC on the 12th is 2:30 AM on the 13th
    k = karachi_datetime(datetime(2026, 10, 12, 21, 30, tzinfo=UTC))
    assert karachi_date(k) == "Tue 13 Oct" and time_12h(k.time()) == "2:30 AM"


def test_sport_names_are_the_ones_the_app_shows() -> None:
    assert sport_name("futsal") == "Futsal"
    assert sport_name("football") == "Futsal"
    assert sport_name("table_tennis") == "Table tennis"
    assert sport_name("Table Tennis") == "Table tennis"
    assert sport_name("rugby") == "Rugby"


def test_every_template_has_a_sample_and_every_sample_a_template() -> None:
    assert set(RAW) == set(EVENT_META)


@pytest.mark.parametrize("event", sorted(RAW))
def test_no_notice_shows_a_raw_value(event: str) -> None:
    _, body, _ = render(event, RAW[event])
    assert "PKR" not in body and "Rs." not in body, body
    assert not re.search(r"\d{4}-\d{2}-\d{2}", body), body  # an ISO date
    assert not re.search(r"\d\.00\b", body), body  # 2000.00
    assert not re.search(r"[a-z]+_[a-z]+", body), body  # a raw key such as table_tennis
    assert not re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-", body), body  # an id
    assert "{" not in body and "(s)" not in body, body
    assert "football" not in body.lower()


def test_each_changed_notice_reads_as_planned() -> None:
    assert render("refund_initiated", RAW["refund_initiated"])[1] == (
        "A refund of ₨ 2,000 has been initiated for your booking."
    )
    assert (
        render("refund_completed", RAW["refund_completed"])[1]
        == "Your refund of ₨ 3,000 has been completed."
    )
    assert render("refund_to_send", RAW["refund_to_send"])[1] == (
        "Ayesha cancelled a booking at Goal Line Arena. Send ₨ 2,500.50 back by bank transfer, "
        "then mark it as paid."
    )
    assert render("refund_needs_manual", RAW["refund_needs_manual"])[1] == (
        "We could not complete your refund of ₨ 2,000 automatically. Our team will process it "
        "and contact you."
    )
    assert render("new_confirmed_booking", {"count": 1})[1] == "You have 1 new confirmed booking."
    assert render("new_confirmed_booking", {"count": 3})[1] == "You have 3 new confirmed bookings."
    assert (
        render("match_joined", RAW["match_joined"])[1]
        == "Sara joined your Futsal match at Goal Line Arena."
    )
    assert (
        render("match_left", RAW["match_left"])[1]
        == "Sara left your Futsal match at Goal Line Arena."
    )
    assert render("match_full", RAW["match_full"])[1] == (
        "The Futsal match at Goal Line Arena on Tue 13 Oct at 7:00 PM now has all its players."
    )
    assert render("match_cancelled", RAW["match_cancelled"])[1] == (
        "The Table tennis match at Goal Line Arena on Tue 13 Oct at 7:00 PM was cancelled."
    )


async def _count(db: AsyncSession, user_id, event: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.event == event)
        )
        or 0
    )


async def test_one_join_makes_one_joined_and_one_full_notice_for_the_creator(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    creator, creator_user, group_id, *_ = await _setup(client, db_session, "wd1")
    match_id = (await _post(client, creator, group_id, max_players=2)).json()["data"]["id"]
    joiner, joiner_user = await make_user(client, db_session, "wd-joiner@example.com", "player")

    first = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))
    # the same tap sent again (a double tap) is refused and adds nothing
    again = await client.post(f"/api/v1/matches/{match_id}/join", headers=auth_header(joiner))
    assert first.status_code == 200 and again.status_code == 409

    assert await _count(db_session, creator_user.id, "match_joined") == 1
    assert await _count(db_session, creator_user.id, "match_full") == 1
    assert await _count(db_session, joiner_user.id, "match_full") == 1
    assert await _count(db_session, joiner_user.id, "match_joined") == 0

    rows = (
        await db_session.scalars(
            select(Notification).where(
                Notification.user_id == creator_user.id,
                Notification.event.in_(["match_joined", "match_full"]),
            )
        )
    ).all()
    bodies = {r.event: r.body for r in rows}
    assert re.fullmatch(r"Test User joined your Futsal match at .+\.", bodies["match_joined"])
    assert re.fullmatch(
        r"The Futsal match at .+ on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} at \d{1,2}:\d{2} [AP]M "
        r"now has all its players\.",
        bodies["match_full"],
    )
