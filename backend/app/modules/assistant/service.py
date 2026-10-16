"""The ArenaHub assistant: fixed, checked answers plus the player's own data.

No outside AI service and no free text is ever made up: every answer is one of the sentences
below (each listed with its source in docs/ASSISTANT_ANSWERS.md), with the player's own bookings,
payments and refunds filled in. It never promises a refund time, never shows a support address
or phone, and never reads another person's data (a booking code is looked up only among the
player's own bookings). Nothing is stored; only the intent name is logged, never the words.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.arena import repository as arena_repo
from app.modules.assistant import intents
from app.modules.booking import group_service
from app.modules.booking import service as booking_service
from app.modules.payment import repository as payment_repo
from app.modules.user.model import User, UserRole
from app.shared.display import rupees
from app.shared.refunds import free_cancel_cutoff

log = structlog.get_logger()

FALLBACK = (
    "I am not sure about that one. You can ask me about bookings, refunds, payments or matches, "
    "or write to support."
)


@dataclass
class Action:
    kind: str  # open_booking | open_payments | open_new_complaint | open_my_matches | open_search
    label: str
    target: str | None = None  # the booking group id for open_booking


@dataclass
class Answer:
    intent: str
    text: str
    actions: list[Action] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)  # intent ids

    def as_dict(self) -> dict:
        return {
            "intent": self.intent,
            "answer": self.text,
            "actions": [a.__dict__ for a in self.actions],
            "suggestions": [{"id": s, "label": intents.SUGGESTIONS[s]} for s in self.suggestions],
        }


def _when(d: date, t: time) -> str:
    """Tue 13 Oct at 7:00 PM"""
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')} at {_clock(t.hour, t.minute)}"


def _clock(h: int, m: int) -> str:
    return f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def _cutoff_words(at: datetime) -> str:
    hour = at.hour % 12 or 12
    return (
        f"{hour}:{at.minute:02d} {'AM' if at.hour < 12 else 'PM'} on {at.day} {at.strftime('%b')}"
    )


async def _upcoming(db: AsyncSession, user: User, limit: int = 1) -> tuple[list[dict], int]:
    return await group_service.list_groups(db, user, "upcoming", 1, limit)


async def _my_group_by_code(db: AsyncSession, user: User, code: str) -> dict | None:
    """Only the player's own bookings are searched: another person's code finds nothing."""
    for tab in ("upcoming", "past", "cancelled"):
        rows, _ = await group_service.list_groups(db, user, tab, 1, 500)
        for row in rows:
            if row["booking_code"] == code:
                return row
    return None


def _open(row: dict) -> Action:
    return Action("open_booking", "Open booking", str(row["booking_group_id"]))


# ---- the answers -------------------------------------------------------------------------------


async def _next_booking(db: AsyncSession, user: User, _: str) -> Answer:
    rows, _total = await _upcoming(db, user)
    if not rows:
        return Answer(
            "next_booking",
            "You have no upcoming bookings.",
            [Action("open_search", "Find an arena")],
            ["how_to_book", "refund_status"],
        )
    b = rows[0]
    return Answer(
        "next_booking",
        f"Your next game is {_when(b['booking_date'], b['start_time'])}, {b['arena_name']}, "
        f"{b['court_name']}. Booking code {b['booking_code']}.",
        [_open(b)],
        ["cancel", "move"],
    )


async def _bookings_count(db: AsyncSession, user: User, _text: str) -> Answer:
    _, upcoming = await group_service.list_groups(db, user, "upcoming", 1, 1)
    _, past = await group_service.list_groups(db, user, "past", 1, 1)
    _, cancelled = await group_service.list_groups(db, user, "cancelled", 1, 1)

    def n(k: int, word: str) -> str:
        return f"{k} {word}" if k == 1 else f"{k} {word}s"

    return Answer(
        "bookings_count",
        f"You have {n(upcoming, 'upcoming booking')}, {n(past, 'past booking')} and "
        f"{n(cancelled, 'cancelled booking')}. You can see them all in Bookings.",
        [],
        ["next_booking", "refund_status"],
    )


async def _for_booking(db: AsyncSession, user: User, text: str) -> tuple[dict | None, bool]:
    """The booking a question is about: the code written in it (own bookings only), else the
    next upcoming one. The flag is False when a code was written but is not one of theirs."""
    code = intents.booking_code_in(text)
    if code:
        row = await _my_group_by_code(db, user, code)
        return row, row is not None
    rows, _ = await _upcoming(db, user)
    return (rows[0] if rows else None), True


_NOT_YOURS = "I could not find that booking code in your bookings."


async def _cancel(db: AsyncSession, user: User, text: str) -> Answer:
    general = (
        "Open My bookings, tap the booking, then tap Cancel booking. "
        "You will see how much comes back before you confirm."
    )
    row, found = await _for_booking(db, user, text)
    if not found:
        return Answer("cancel", _NOT_YOURS, [], ["next_booking", "cancel"])
    if row is None:
        return Answer("cancel", general, [], ["refund_status", "next_booking"])
    details = await booking_service.get_group_details(db, user, row["booking_group_id"])
    rule = details.cancellation_note or "Refunds follow the arena policy shown on your booking."
    return Answer(
        "cancel",
        f"{general} For {details.booking_code}: {rule}",
        [_open(row)],
        ["move", "refund_status"],
    )


async def _move(db: AsyncSession, user: User, text: str) -> Answer:
    general = (
        "You can move a booking once, before its free cancellation time ends: open the booking "
        "and tap Reschedule."
    )
    row, found = await _for_booking(db, user, text)
    if not found:
        return Answer("move", _NOT_YOURS, [], ["next_booking"])
    if row is None:
        return Answer("move", general, [], ["next_booking", "cancel"])
    details = await booking_service.get_group_details(db, user, row["booking_group_id"])
    if details.can_reschedule:
        arena = await arena_repo.get_arena(db, details.arena_id)
        start = datetime.combine(details.booking_date, details.start_time)
        until = free_cancel_cutoff(arena.refund_policy if arena else [], start)
        tail = f"{details.booking_code} can be moved until {_cutoff_words(until)}."
    else:
        tail = f"{details.booking_code} can no longer be moved."
    return Answer("move", f"{general} {tail}", [_open(row)], ["cancel"])


async def _refund_status(db: AsyncSession, user: User, _: str) -> Answer:
    payments, _total = await payment_repo.list_payments_for_player(db, user.id, offset=0, limit=50)
    latest = None
    for payment, _arena, _day in payments:
        for refund in await payment_repo.list_refunds_for_payment(db, payment.id):
            if latest is None or refund.created_at > latest[0].created_at:
                latest = (refund, payment)
    if latest is None:
        return Answer(
            "refund_status",
            "You have no refunds. When you cancel, we show how much comes back before you confirm.",
            [Action("open_payments", "Open payment history")],
            ["cancel", "next_booking"],
        )
    refund, payment = latest
    code = booking_service.booking_code_for(payment.booking_group_id)
    amount = rupees(Decimal(refund.amount))
    status = refund.status.value
    if status == "processed":
        text = f"Your refund of {amount} for {code} was sent to your bank."
    else:
        # pending (and a failed try, which the arena sends again by hand): the same honest words
        text = (
            f"Your refund of {amount} for {code} is waiting. The arena sends it back by bank "
            "transfer and you will get a message when it is done."
        )
    return Answer(
        "refund_status", text, [Action("open_payments", "Open payment history")], ["cancel"]
    )


async def _awaiting_payment(db: AsyncSession, user: User, _text: str) -> Answer:
    general = (
        "A booking waits for payment until it is paid. With Bank transfer, send the exact amount "
        "to the arena account shown, then upload your receipt. A booking not paid within 24 hours "
        "is cancelled and its time is freed."
    )
    rows, _ = await group_service.list_groups(db, user, "upcoming", 1, 50)
    waiting = next((r for r in rows if r["status"] == "pending_payment"), None)
    checking = next((r for r in rows if r["status"] == "pending_approval"), None)
    if waiting is not None:
        return Answer(
            "awaiting_payment",
            f"{general} {waiting['booking_code']} is waiting for payment.",
            [_open(waiting)],
            ["bank_transfer"],
        )
    if checking is not None:
        return Answer(
            "awaiting_payment",
            f"{checking['booking_code']} is waiting for the arena to check your receipt. Your time "
            "is only booked once the arena confirms your receipt.",
            [_open(checking)],
            ["bank_transfer"],
        )
    return Answer("awaiting_payment", general, [], ["bank_transfer", "next_booking"])


def _fixed(intent: str, text: str, actions: Any = None, suggestions: Any = None) -> Any:
    async def answer(db: AsyncSession, user: User, _: str) -> Answer:
        return Answer(intent, text, list(actions or []), list(suggestions or []))

    return answer


ANSWERS = {
    "next_booking": _next_booking,
    "bookings_count": _bookings_count,
    "cancel": _cancel,
    "move": _move,
    "refund_status": _refund_status,
    "awaiting_payment": _awaiting_payment,
    "how_to_book": _fixed(
        "how_to_book",
        "Search for a sport or an arena, open the arena, pick a court and a free time, then go on "
        "to pay. Your time is only booked once the arena confirms your payment.",
        [Action("open_search", "Find an arena")],
        ["bank_transfer", "cancel"],
    ),
    "bank_transfer": _fixed(
        "bank_transfer",
        "Pick Bank transfer when you pay. Send the exact amount to the arena account shown, with "
        "the reference shown, then upload a photo of your receipt (JPG or PNG, up to 5 MB). The "
        "arena checks it and confirms or turns down your booking.",
        [],
        ["awaiting_payment", "next_booking"],
    ),
    "matches_how": _fixed(
        "matches_how",
        "A match is a game you post from one of your confirmed bookings so other players can "
        "join. You settle the cost with each other. No payment happens in the app.",
        [Action("open_my_matches", "Open my matches")],
        ["join_match"],
    ),
    "join_match": _fixed(
        "join_match",
        "Open Play, then Open matches, tap a match and tap Join match. If it is full, someone "
        "else got the last place.",
        [Action("open_my_matches", "Open my matches")],
        ["matches_how"],
    ),
    "rate_arena": _fixed(
        "rate_arena",
        "You can rate an arena after your game there is over: open Bookings, Past, and tap Rate "
        "this game on that booking.",
        [],
        ["report_review"],
    ),
    "report_review": _fixed(
        "report_review",
        "Open the arena's reviews, tap the three dots on the review and choose Report this "
        "review. The team looks at it.",
        [],
        ["rate_arena"],
    ),
    "change_email_password": _fixed(
        "change_email_password",
        "Email: Profile, Personal information, then Change next to your email. Enter the new "
        "address and your password; we send a 6-digit code to the new address. Password: "
        "Profile, Settings, Change password; we email you a code, and every device is signed "
        "out after the change.",
        [],
        ["delete_account"],
    ),
    "delete_account": _fixed(
        "delete_account",
        "Profile, Settings, Delete account. It is refused while you have upcoming or unpaid "
        "bookings: cancel them or wait until they are done, then delete your account.",
        [],
        ["next_booking"],
    ),
    "what_is_futsal": _fixed(
        "what_is_futsal",
        "Futsal is five-a-side football on a small court. In ArenaHub, a search for football or "
        "5-a-side shows futsal arenas.",
        [Action("open_search", "Find a futsal arena")],
        ["how_to_book"],
    ),
    "near_me": _fixed(
        "near_me",
        "Near me sorts arenas by distance from you. It needs your location: if location is off, "
        "the app says so and shows arenas in your city instead.",
        [Action("open_search", "Open search")],
        ["how_to_book"],
    ),
    "notifications": _fixed(
        "notifications",
        "Profile, Notifications shows your messages. In Profile, Settings you can turn booking "
        "updates, reminders, payments and refunds, and matches on or off.",
        [],
        ["next_booking"],
    ),
    "app_problem": _fixed(
        "app_problem",
        "If the app says you are offline, connect to Wi-Fi or mobile data; we load things again "
        "when you are back online. If something still does not work, write to support.",
        [Action("open_new_complaint", "New complaint")],
        ["next_booking"],
    ),
}
assert set(ANSWERS) == set(intents.INTENTS)


async def ask(db: AsyncSession, user: User, text: str | None, suggestion: str | None) -> dict:
    if user.role != UserRole.player:
        raise ForbiddenError("The assistant is for players.")
    if suggestion:
        if suggestion not in intents.SUGGESTIONS:
            raise ValidationError("Unknown suggestion.")
        intent, words = suggestion, ""
    else:
        words = (text or "").strip()[: intents.MAX_TEXT]
        if not words:
            raise ValidationError("Type a question.")
        intent = intents.match(words)
    # an anonymous count of what is asked: the intent only, never the words or who asked
    log.info("assistant_intent", intent=intent)
    if intent == intents.NOT_SURE:
        return Answer(
            intents.NOT_SURE,
            FALLBACK,
            [Action("open_new_complaint", "New complaint")],
            ["next_booking", "refund_status"],
        ).as_dict()
    return (await ANSWERS[intent](db, user, words)).as_dict()
