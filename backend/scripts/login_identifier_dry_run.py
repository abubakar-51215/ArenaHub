"""Dry run for "log in with email or phone". Read-only: it runs SELECTs only and
changes nothing.

Reports what a canonical form would do to the existing rows:

* phones that do not normalise (cannot become a canonical Pakistani mobile),
* phone groups that collide once normalised (two accounts, one number),
* email groups that collide once lowercased (case-only duplicates).

Canonical phone form: digits only; a leading "+92" or "92" becomes "0". A
canonical mobile is 11 digits starting with "03".

Usage (from backend/):
    uv run python scripts/login_identifier_dry_run.py
"""

import asyncio
import re
from collections import defaultdict

from sqlalchemy import select

import app.main  # noqa: F401  (imports every model so the mappers resolve)
from app.database.session import SessionFactory
from app.modules.user.model import User


def canonical_phone(raw: str) -> str | None:
    """Digits only; +92 / 92 prefix becomes 0. None if it is not a canonical
    11-digit mobile starting with 03."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("92") and len(digits) == 12:
        digits = "0" + digits[2:]
    if len(digits) == 11 and digits.startswith("03"):
        return digits
    return None


def _group(rows: list[tuple[str, str]]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = defaultdict(list)
    for key, label in rows:
        groups[key].append(label)
    return {k: v for k, v in groups.items() if len(v) > 1}


async def main() -> None:
    async with SessionFactory() as db:
        users = (await db.execute(select(User.id, User.email, User.phone))).all()

    print(f"Users scanned: {len(users)}\n")

    not_normalising = [(u.email, u.phone) for u in users if canonical_phone(u.phone) is None]
    print(f"1. Phones that do not normalise to 03XXXXXXXXX: {len(not_normalising)}")
    for email, phone in not_normalising:
        print(f"   {email}  phone={phone!r}")

    phone_groups = _group(
        [(c, f"{u.email} ({u.phone})") for u in users if (c := canonical_phone(u.phone))]
    )
    print(f"\n2. Phone collisions after normalising: {len(phone_groups)} group(s)")
    for canon, members in phone_groups.items():
        print(f"   {canon}: {', '.join(members)}")

    email_groups = _group([(u.email.lower(), u.email) for u in users])
    print(f"\n3. Email collisions after lowercasing: {len(email_groups)} group(s)")
    for lowered, members in email_groups.items():
        print(f"   {lowered}: {', '.join(members)}")

    mixed = [u.email for u in users if u.email != u.email.lower()]
    print(f"\n4. Emails with uppercase letters (would change when lowercased): {len(mixed)}")
    for email in mixed:
        print(f"   {email}")

    print("\nNothing was changed.")


if __name__ == "__main__":
    asyncio.run(main())
