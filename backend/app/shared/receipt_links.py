"""Private receipt pictures: shown only through short-lived signed links.

A bank-transfer receipt can show account numbers and names, so it is never served from the
public ``/uploads`` folder. The database keeps the address the upload returned
(``/uploads/receipts/<name>``); every answer that carries it to someone allowed to see it (the
player who paid, the arena owner, an admin; the services already check that) turns it into
``/api/v1/media/receipts/<name>?expires=<unix time>&sig=<hmac>``. The link works for
``LINK_MINUTES`` and only for that one file; the key is derived from ``CODE_HASH_SECRET``.
"""

import hashlib
import hmac
import re
import time
from pathlib import Path
from typing import Annotated

from pydantic import PlainSerializer

from app.core.config import get_settings

LINK_MINUTES = 15
ROUTE = "/api/v1/media/receipts"
NAME = re.compile(r"^[0-9a-f]{32}\.(jpg|png|webp)$")


def _key() -> bytes:
    secret = get_settings().code_hash_secret.get_secret_value().encode()
    return hmac.new(secret, b"arenahub receipt links v1", hashlib.sha256).digest()


def _signature(name: str, expires: int) -> str:
    return hmac.new(_key(), f"{name}:{expires}".encode(), hashlib.sha256).hexdigest()


def stored_name(stored_url: str) -> str | None:
    """The file name inside a stored receipt address, or None when it is not one of ours."""
    prefix = f"{get_settings().media_url_prefix}/receipts/"
    if not stored_url.startswith(prefix):
        return None
    name = stored_url[len(prefix) :]
    return name if NAME.match(name) else None


def signed_link(stored_url: str | None, now: float | None = None) -> str | None:
    """The signed address for a stored receipt; None stays None. An address that is not one of
    our receipts is not returned at all (nothing unknown is ever handed to a viewer)."""
    if not stored_url:
        return None
    name = stored_name(stored_url)
    if name is None:
        return None
    expires = int((now if now is not None else time.time()) + LINK_MINUTES * 60)
    return f"{ROUTE}/{name}?expires={expires}&sig={_signature(name, expires)}"


def check(name: str, expires: int, sig: str, now: float | None = None) -> bool:
    if not NAME.match(name):
        return False
    if expires < (now if now is not None else time.time()):
        return False
    return hmac.compare_digest(_signature(name, expires), sig)


def receipt_path(name: str) -> Path:
    return Path(get_settings().media_root) / "receipts" / name


# A response field holding a stored receipt address is written out as a signed link.
# Only in JSON answers: inside the server (and in the database) the stored address is kept.
ReceiptLink = Annotated[
    str | None, PlainSerializer(signed_link, return_type=str | None, when_used="json")
]
