"""The ArenaHub assistant: every intent from several phrasings (English and Roman Urdu), the honest
"not sure" fallback, answers from the player's own data only, and the guards (signed in, players
only, text limits). No outside service is involved."""

import uuid
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from structlog.testing import capture_logs

from app.modules.assistant import intents
from app.modules.assistant.service import FALLBACK, OUT_OF_SCOPE
from app.modules.booking.service import booking_code_for
from app.modules.payment.model import Refund, RefundStatus
from app.modules.user.model import User
from tests.helpers import auth_header, make_user
from tests.modules.test_review import _make_bookable_court, _slots

ASK = "/api/v1/assistant/ask"

PHRASINGS: dict[str, list[str]] = {
    "next_booking": [
        "When is my next booking?",
        "what time is my next game",
        "meri agli booking kab hai",
        "next booking please",
    ],
    "bookings_count": [
        "How many bookings do I have?",
        "how many bookings",
        "meri kitni booking hain",
    ],
    "how_to_book": ["How do I book a court?", "how to book", "how can I make a booking"],
    "bank_transfer": [
        "How do I pay by bank transfer?",
        "where do I upload the receipt",
        "bank transfer kaise karun",
    ],
    "awaiting_payment": [
        "Why is my booking awaiting payment?",
        "my booking is still pending",
        "booking not confirmed why",
    ],
    "cancel": ["How do I cancel?", "cancel my booking", "booking kaise cancel karun", "radd karna"],
    "move": ["Can I move it?", "can I reschedule", "booking ka time badalna hai"],
    "refund_status": [
        "Where is my refund?",
        "I want my money back",
        "paise wapas kab milenge",
        "refund status",
    ],
    "matches_how": ["How do matches work?", "what is a match", "post a match"],
    "join_match": ["How do I join a match?", "join match", "how can I join"],
    "rate_arena": ["How do I rate an arena?", "write a review", "rating kaise dun"],
    "report_review": ["How do I report a review?", "report review", "this is a fake review"],
    "change_email_password": [
        "How do I change my email?",
        "change password",
        "I want a new email",
    ],
    "delete_account": ["How do I delete my account?", "close my account", "delete account"],
    "what_is_futsal": ["What is futsal?", "what does futsal mean", "five a side"],
    "near_me": ["How does near me work?", "arenas nearby", "location is not used"],
    "notifications": ["notifications", "turn off reminders", "how do notifications work"],
    "app_problem": ["The app is not working", "app is offline", "it is stuck", "I found a bug"],
    "payments_how": [
        "How do payments work?",
        "what payment methods do you have",
        "how can I pay",
        "jazzcash",
    ],
    "complaints_how": [
        "How do I contact support?",
        "file a complaint",
        "how do complaints work",
        "new complaint",
    ],
}


@pytest.mark.parametrize(
    ("intent", "text"),
    [(i, t) for i, texts in PHRASINGS.items() for t in texts],
)
def test_every_intent_is_understood_from_several_phrasings(intent: str, text: str) -> None:
    assert intents.match(text) == intent


def test_every_intent_is_covered() -> None:
    assert set(PHRASINGS) == set(intents.INTENTS) == set(intents.SUGGESTIONS) - set()


@pytest.mark.parametrize(
    "text",
    [
        "Can you change my arena owner?",
        "hello",
        "what is the weather",
        "😀🔥",
        "بکنگ",
        "asdf qwer",
        "",
    ],
)
def test_anything_else_is_not_sure(text: str) -> None:
    assert intents.match(text) == intents.NOT_SURE


def test_a_tie_is_not_sure() -> None:
    # equal weight for two answers: never pick one at random
    assert intents.scores("cancel move")["cancel"] == intents.scores("cancel move")["move"]
    assert intents.match("cancel move") == intents.NOT_SURE


# ---- the endpoint ------------------------------------------------------------------------------


async def _ask(client: AsyncClient, tok: dict, **body: Any) -> dict:
    res = await client.post(ASK, headers=auth_header(tok), json=body)
    assert res.status_code == 200, res.text
    return res.json()["data"]


async def test_not_sure_sends_to_support_and_never_guesses(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tok, _ = await make_user(client, db_session, "as-unsure@example.com")
    data = await _ask(client, tok, text="Can you change my arena owner?")
    assert data["intent"] == "not_sure" and data["answer"] == FALLBACK
    assert [a["kind"] for a in data["actions"]] == ["open_new_complaint"]
    assert [s["id"] for s in data["suggestions"]] == ["next_booking", "refund_status"]


async def test_out_of_scope_questions_get_the_exact_approved_wording(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Nothing from ArenaHub in the question at all: the fixed, exact "not from our project"
    reply, word for word, never combined with FALLBACK or an action."""
    tok, _ = await make_user(client, db_session, "as-outofscope@example.com")
    for text in ("what is the weather today", "tell me a joke", "who is the president of France"):
        data = await _ask(client, tok, text=text)
        assert data["intent"] == "not_sure"
        assert data["answer"] == OUT_OF_SCOPE
        assert OUT_OF_SCOPE == "Sorry this is not from our project please ask me about it"
        assert data["actions"] == []
        assert data["suggestions"] == []


async def test_an_arenahub_question_that_is_still_unclear_keeps_the_ordinary_fallback(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A question that uses an ArenaHub word but still is not understood must never be told it
    is "not from our project" — it gets the ordinary fallback, with support offered."""
    tok, _ = await make_user(client, db_session, "as-unclear@example.com")
    data = await _ask(client, tok, text="Can you change my arena owner?")
    assert data["intent"] == "not_sure" and data["answer"] == FALLBACK
    assert data["answer"] != OUT_OF_SCOPE


async def test_answers_without_bookings_or_refunds(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tok, _ = await make_user(client, db_session, "as-empty@example.com")
    nxt = await _ask(client, tok, suggestion="next_booking")
    assert nxt["answer"] == "You have no upcoming bookings."
    refund = await _ask(client, tok, text="Where is my refund?")
    assert refund["answer"].startswith("You have no refunds.")
    count = await _ask(client, tok, text="how many bookings do I have")
    assert count["answer"].startswith("You have 0 upcoming bookings, 0 past bookings")


async def _booking(client: AsyncClient, db: AsyncSession, tag: str) -> tuple[dict, User, dict]:
    owner, _ = await make_user(client, db, f"as-owner-{tag}@example.com", "owner")
    player, user = await make_user(client, db, f"as-player-{tag}@example.com")
    _, court_id, day = await _make_bookable_court(client, db, owner, f"as-owner-{tag}")
    slots = await _slots(client, court_id, day)
    created = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court_id, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    assert created.status_code in (200, 201), created.text
    group = created.json()["data"]
    group["booking_code"] = booking_code_for(uuid.UUID(group["booking_group_id"]))
    return player, user, group


async def test_account_aware_answers_with_a_booking_and_a_refund(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, user, group = await _booking(client, db_session, "a")
    code = group["booking_code"]
    nxt = await _ask(client, player, text="When is my next booking?")
    assert code in nxt["answer"] and nxt["answer"].startswith("Your next game is ")
    assert nxt["actions"] == [
        {"kind": "open_booking", "label": "Open booking", "target": group["booking_group_id"]}
    ]
    cancel = await _ask(client, player, text="How do I cancel it?")
    assert f"For {code}:" in cancel["answer"]
    waiting = await _ask(client, player, text="why is my booking awaiting payment")
    assert f"{code} is waiting for payment." in waiting["answer"]

    # a refund for this player's booking: the real amount and code, no promised days
    pay = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={"booking_group_id": group["booking_group_id"], "payment_method": "bank_transfer"},
    )
    assert pay.status_code in (200, 201), pay.text
    payment_id = pay.json()["data"]["payment"]["id"]
    db_session.add(
        Refund(
            booking_id=uuid.UUID(group["bookings"][0]["id"]),
            payment_id=uuid.UUID(payment_id),
            amount=3000,
            reason="Cancelled by player",
            status=RefundStatus.pending,
        )
    )
    await db_session.commit()
    refund = await _ask(client, player, suggestion="refund_status")
    assert refund["answer"] == (
        f"Your refund of ₨ 3,000 for {code} is waiting. The arena sends it back by bank "
        "transfer and you will get a message when it is done."
    )
    assert refund["actions"][0]["kind"] == "open_payments"
    for word in ("day", "hour", "week", "@", "+92"):
        assert word not in refund["answer"]


async def test_cancel_answer_says_the_slot_is_free_again(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tok, _ = await make_user(client, db_session, "as-cancelfree@example.com")
    data = await _ask(client, tok, text="how do I cancel")
    assert "free again for someone else to book" in data["answer"]


async def test_payments_how_and_complaints_how_answers(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tok, _ = await make_user(client, db_session, "as-newintents@example.com")
    payments = await _ask(client, tok, text="how do payments work")
    assert "Card, Bank transfer, JazzCash and EasyPaisa" in payments["answer"]
    complaints = await _ask(client, tok, text="how do I contact support")
    assert "New complaint" in complaints["answer"]
    assert [a["kind"] for a in complaints["actions"]] == ["open_new_complaint"]
    assert "no support email or phone" in complaints["answer"]


async def test_another_players_booking_code_never_leaks(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, _, theirs = await _booking(client, db_session, "b")
    mine, _ = await make_user(client, db_session, "as-other@example.com")
    for q in (f"how do I cancel {theirs['booking_code']}", f"can I move {theirs['booking_code']}"):
        data = await _ask(client, mine, text=q)
        assert data["answer"] == "I could not find that booking code in your bookings."
        assert data["actions"] == []


async def test_text_limits_and_odd_input(client: AsyncClient, db_session: AsyncSession) -> None:
    tok, _ = await make_user(client, db_session, "as-limits@example.com")
    empty = await client.post(ASK, headers=auth_header(tok), json={"text": "   "})
    assert empty.status_code == 422
    nothing = await client.post(ASK, headers=auth_header(tok), json={})
    assert nothing.status_code == 422
    long = await client.post(ASK, headers=auth_header(tok), json={"text": "x" * 301})
    assert long.status_code == 422
    unknown = await client.post(ASK, headers=auth_header(tok), json={"suggestion": "hack"})
    assert unknown.status_code == 422
    emoji = await _ask(client, tok, text="😀🔥 بکنگ")
    assert emoji["intent"] == "not_sure"


async def test_only_signed_in_active_players(client: AsyncClient, db_session: AsyncSession) -> None:
    assert (await client.post(ASK, json={"text": "hi"})).status_code == 401
    owner, _ = await make_user(client, db_session, "as-owneronly@example.com", "owner")
    res = await client.post(ASK, headers=auth_header(owner), json={"text": "hi"})
    assert res.status_code == 403
    tok, user = await make_user(client, db_session, "as-suspended@example.com")
    user.is_active = False
    await db_session.commit()
    res = await client.post(ASK, headers=auth_header(tok), json={"text": "next booking"})
    assert res.status_code == 401


async def test_the_words_are_never_logged(client: AsyncClient, db_session: AsyncSession) -> None:
    tok, _ = await make_user(client, db_session, "as-logs@example.com")
    secret = "my secret question about refund zebra"
    with capture_logs() as logs:
        await _ask(client, tok, text=secret)
    assert any(e.get("event") == "assistant_intent" for e in logs)
    assert all("zebra" not in str(e) for e in logs)
