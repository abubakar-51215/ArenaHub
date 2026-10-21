"""The ArenaHub assistant's understanding: which checked answer a question asks for.

Rule based and deterministic: the words are normalised (lower case, Roman Urdu words mapped to
English ones), every intent scores the phrases it knows, and the single best intent above the bar
wins. A tie, or nothing above the bar, is "not sure": the assistant never guesses. Every answer
sentence is listed with its source in docs/ASSISTANT_ANSWERS.md.
"""

import re
import unicodedata

MAX_TEXT = 300
NOT_SURE = "not_sure"

# Roman Urdu (and common spellings) -> the English word the intents know
SYNONYMS = {
    "agli": "next",
    "agla": "next",
    "aglay": "next",
    "kab": "when",
    "kahan": "where",
    "kaise": "how",
    "kesay": "how",
    "kaisay": "how",
    "kaese": "how",
    "kitni": "how many",
    "kitne": "how many",
    "kitnay": "how many",
    "paise": "money",
    "paisay": "money",
    "paisa": "money",
    "raqam": "money",
    "wapas": "refund",
    "wapis": "refund",
    "radd": "cancel",
    "khatam": "cancel",
    "badlo": "move",
    "badalna": "move",
    "badalni": "move",
    "shift": "move",
    "khelna": "play",
    "khel": "play",
    "mera": "my",
    "meri": "my",
    "mere": "my",
    "bukking": "booking",
    "bookings": "booking",
    "booked": "booking",
    "matches": "match",
    "refunds": "refund",
    "payments": "payment",
    "pay": "payment",
    "paid": "payment",
    "paying": "payment",
    "reviews": "review",
    "notifications": "notification",
    "notify": "notification",
    "alerts": "notification",
    "reschedule": "move",
    "rescheduled": "move",
    "postpone": "move",
    "change time": "move time",
    "cancelled": "cancel",
    "cancellation": "cancel",
    "canceled": "cancel",
    "upcoming": "next",
    "transfer": "transfer",
    "rating": "rate",
    "ratings": "rate",
    "stars": "rate",
    "delete": "delete",
    "remove": "delete",
    "band": "close",
}

# intent -> (phrase, weight). Phrases are matched as whole words on the normalised text.
INTENTS: dict[str, list[tuple[str, int]]] = {
    "next_booking": [
        ("next booking", 4),
        ("next game", 4),
        ("next match booking", 3),
        ("when", 1),
        ("next", 2),
        ("booking", 1),
        ("my booking", 1),
        ("what time", 1),
    ],
    "bookings_count": [
        ("how many booking", 5),
        ("how many", 2),
        ("my booking", 1),
        ("booking list", 3),
        ("all my booking", 4),
        ("count", 2),
    ],
    "how_to_book": [
        ("how to book", 5),
        ("how do i book", 5),
        ("how can i book", 5),
        ("book a court", 4),
        ("book an arena", 4),
        ("make a booking", 4),
        ("new booking", 3),
        ("book", 1),
    ],
    "bank_transfer": [
        ("bank transfer", 5),
        ("bank", 3),
        ("transfer", 2),
        ("receipt", 3),
        ("payment", 1),
        ("how", 1),
        ("account number", 3),
    ],
    "awaiting_payment": [
        ("awaiting payment", 6),
        ("waiting for payment", 5),
        ("pending payment", 5),
        ("not confirmed", 4),
        ("awaiting approval", 5),
        ("still pending", 4),
        ("why", 1),
        ("pending", 2),
        ("unpaid", 3),
    ],
    "cancel": [
        ("how do i cancel", 6),
        ("how to cancel", 6),
        ("cancel", 4),
        ("free cancel", 4),
        ("cancel it", 2),
        ("refund policy", 2),
    ],
    "move": [
        ("move", 4),
        ("move it", 2),
        ("another time", 3),
        ("change the time", 4),
        ("move time", 2),
        ("different time", 3),
        ("change my booking", 3),
    ],
    "refund_status": [
        ("where is my refund", 7),
        ("refund", 4),
        ("money back", 4),
        ("money", 1),
        ("where", 1),
        ("status", 1),
    ],
    "matches_how": [
        ("how do matches work", 7),
        ("how does a match work", 7),
        ("what is a match", 6),
        ("match", 3),
        ("post a match", 4),
        ("players", 1),
        ("split", 2),
        ("my match", 2),
    ],
    "join_match": [
        ("join a match", 7),
        ("join match", 7),
        ("join", 4),
        ("play with", 2),
        ("find players", 3),
        ("open match", 3),
    ],
    "rate_arena": [
        ("rate", 4),
        ("rate an arena", 6),
        ("write a review", 5),
        ("leave a review", 5),
        ("review", 2),
        ("feedback", 2),
    ],
    "report_review": [
        ("report a review", 7),
        ("report review", 7),
        ("report", 4),
        ("fake review", 4),
        ("rude review", 4),
        ("review", 1),
    ],
    "change_email_password": [
        ("change my email", 6),
        ("change email", 6),
        ("new email", 4),
        ("change my password", 6),
        ("change password", 6),
        ("forgot password", 3),
        ("password", 3),
        ("email", 2),
    ],
    "delete_account": [
        ("delete my account", 7),
        ("delete account", 7),
        ("close my account", 6),
        ("close account", 6),
        ("delete", 3),
        ("account", 1),
    ],
    "what_is_futsal": [
        ("what is futsal", 7),
        ("futsal mean", 7),
        ("futsal", 3),
        ("5 a side", 3),
        ("five a side", 3),
    ],
    "near_me": [
        ("near me", 6),
        ("nearby", 5),
        ("close to me", 5),
        ("location", 4),
        ("distance", 4),
        ("gps", 4),
    ],
    "notifications": [
        ("notification", 5),
        ("messages", 2),
        ("reminder", 3),
        ("reminders", 3),
        ("turn off", 2),
    ],
    "app_problem": [
        ("offline", 5),
        ("no internet", 5),
        ("not working", 5),
        ("not loading", 5),
        ("app problem", 5),
        ("crash", 5),
        ("error", 3),
        ("stuck", 3),
        ("slow", 3),
        ("bug", 4),
    ],
    "payments_how": [
        ("how do payment work", 6),
        ("how does payment work", 6),
        ("payment methods", 5),
        ("payment options", 5),
        ("ways to payment", 4),
        ("how to payment", 4),
        ("how can i payment", 4),
        ("card payment", 3),
        ("jazzcash", 4),
        ("easypaisa", 4),
    ],
    "complaints_how": [
        ("file a complaint", 6),
        ("new complaint", 6),
        ("how do i complain", 6),
        ("how do complaints work", 6),
        ("contact support", 6),
        ("talk to support", 5),
        ("customer support", 5),
        ("contact us", 4),
        ("get help", 3),
        ("report a problem", 4),
        ("complaint", 3),
    ],
}

# below this the assistant is not sure enough to answer
MIN_SCORE = 3

# Nouns whose presence means a question is at least about ArenaHub, even when which intent it
# wants is unclear. Generic question words (how, when, where, what, why) are deliberately left
# out: "what's the capital of France" must not count as in-scope just because it starts with
# "what". A question with none of these words gets the fixed "not from our project" reply
# instead of the ordinary "not sure" one.
IN_SCOPE_WORDS = [
    "booking",
    "match",
    "refund",
    "payment",
    "review",
    "complaint",
    "account",
    "password",
    "email",
    "notification",
    "support",
    "cancel",
    "move",
    "transfer",
    "delete",
    "app",
    "arena",
    "court",
    "slot",
    "rate",
    "report",
    "futsal",
    "cricket",
    "padel",
    "badminton",
    "tennis",
    "squash",
    "basketball",
    "volleyball",
    "snooker",
    "table tennis",
]


def in_scope(text: str) -> bool:
    """Whether the normalised text mentions at least one ArenaHub-specific word."""
    t = normalise(text)
    return any(re.search(rf"\b{re.escape(w)}\b", t) for w in IN_SCOPE_WORDS)


# the question chips (suggestions) the screen can send instead of words
SUGGESTIONS = {
    "next_booking": "When is my next booking?",
    "bookings_count": "How many bookings do I have?",
    "how_to_book": "How do I book a court?",
    "bank_transfer": "How do I pay by bank transfer?",
    "awaiting_payment": "Why is my booking awaiting payment?",
    "cancel": "How do I cancel?",
    "move": "Can I move it?",
    "refund_status": "Where is my refund?",
    "matches_how": "How do matches work?",
    "join_match": "How do I join a match?",
    "rate_arena": "How do I rate an arena?",
    "report_review": "How do I report a review?",
    "change_email_password": "How do I change my email or password?",
    "delete_account": "How do I delete my account?",
    "what_is_futsal": "What is futsal?",
    "near_me": "How does near me work?",
    "notifications": "How do notifications work?",
    "app_problem": "The app is not working",
    "payments_how": "How do payments work?",
    "complaints_how": "How do I contact support?",
}

_CODE = re.compile(r"\bAHB-[0-9A-F]{6}\b", re.IGNORECASE)


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")[:MAX_TEXT].lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text.replace("-", " "))
    words = []
    for w in text.split():
        words.append(SYNONYMS.get(w, w))
    joined = " ".join(words)
    for phrase, to in SYNONYMS.items():
        if " " in phrase:
            joined = re.sub(rf"\b{re.escape(phrase)}\b", to, joined)
    return f" {joined} "


def booking_code_in(text: str) -> str | None:
    m = _CODE.search(text or "")
    return m.group(0).upper() if m else None


def scores(text: str) -> dict[str, int]:
    t = normalise(text)
    out: dict[str, int] = {}
    for intent, phrases in INTENTS.items():
        total = 0
        for phrase, weight in phrases:
            if re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", t):
                total += weight
        if total:
            out[intent] = total
    return out


def match(text: str) -> str:
    """The intent for these words, or ``NOT_SURE`` (nothing clear, or a tie at the top)."""
    s = scores(text)
    if not s:
        return NOT_SURE
    ranked = sorted(s.items(), key=lambda kv: -kv[1])
    best, top = ranked[0]
    if top < MIN_SCORE:
        return NOT_SURE
    if len(ranked) > 1 and ranked[1][1] == top:
        return NOT_SURE
    return best
