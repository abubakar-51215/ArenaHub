"""Phone numbers for sign-in and sign-up: spaces, dashes and brackets are
ignored, and the Pakistani forms of one number are the same number
(0300 1234567, 03001234567, +92 300 1234567, 923001234567, 00923001234567).
Other countries are compared by all their digits."""

import re

_NON_DIGITS = re.compile(r"\D")


def phone_key(raw: str) -> str:
    """One digit string for a number: the international form without 00 or +.
    An 11-digit number starting with 0 is a Pakistani local number."""
    digits = _NON_DIGITS.sub("", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = "92" + digits[1:]
    return digits


def stored_digit_forms(raw: str) -> list[str]:
    """Every digits-only spelling under which this number may be stored, to
    compare with the stored phone's digits in the query (no index or column
    needed)."""
    key = phone_key(raw)
    forms = [key, "00" + key]
    if key.startswith("92") and len(key) == 12:
        forms.append("0" + key[2:])
    return forms
