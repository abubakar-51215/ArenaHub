"""Receipt pictures are private: never through the public /uploads folder, only through a signed,
short-lived link handed to the player, the arena owner or an admin."""

import io
import time
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.shared import receipt_links
from tests.helpers import auth_header, make_user
from tests.modules.test_payment import _make_bookable_court, _slots


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (6, 6), (20, 160, 90)).save(out, format="PNG")
    return out.getvalue()


async def _upload(client: AsyncClient, tokens: dict, folder: str) -> str:
    res = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(tokens),
        params={"folder": folder},
        files={"file": ("r.png", _png(), "image/png")},
    )
    assert res.status_code == 200, res.text
    url: str = res.json()["data"]["url"]
    return url


async def _receipt_for_review(
    client: AsyncClient, db: AsyncSession, tag: str
) -> tuple[dict, dict, str, str]:
    """A player pays by bank transfer and uploads a receipt: (owner, player, payment id, stored)."""
    owner, _ = await make_user(client, db, f"rcpt-owner-{tag}@example.com", "owner")
    player, _ = await make_user(client, db, f"rcpt-player-{tag}@example.com", "player")
    _, court, day = await _make_bookable_court(client, db, owner, f"rcpt-{tag}")
    slots = await _slots(client, court, day)
    booked = await client.post(
        "/api/v1/bookings",
        headers=auth_header(player),
        json={"court_id": court, "slot_ids": [slots[0]["id"]], "payment_type": "full"},
    )
    pay = await client.post(
        "/api/v1/payments/initiate",
        headers=auth_header(player),
        json={
            "booking_group_id": booked.json()["data"]["booking_group_id"],
            "payment_method": "bank_transfer",
        },
    )
    payment_id = pay.json()["data"]["payment"]["id"]
    stored = await _upload(client, player, "receipts")
    sent = await client.post(
        f"/api/v1/payments/{payment_id}/receipt",
        headers=auth_header(player),
        json={"receipt_proof_url": stored},
    )
    assert sent.status_code == 200
    return owner, player, payment_id, stored


async def test_the_public_uploads_folder_never_serves_a_receipt(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "rcpt-public@example.com", "player")
    owner, _ = await make_user(client, db_session, "rcpt-public-owner@example.com", "owner")
    stored = await _upload(client, player, "receipts")
    assert stored.startswith("/uploads/receipts/")
    assert (await client.get(stored)).status_code == 404
    # tricks that reach the same file through the public folder are refused too
    name = stored.rsplit("/", 1)[1]
    for path in (
        f"/uploads/./receipts/{name}",
        f"/uploads/arenas/../receipts/{name}",
        f"/uploads/receipts%2F{name}",
    ):
        assert (await client.get(path)).status_code == 404, path
    # public pictures are still served
    photo = await _upload(client, owner, "arenas")
    assert (await client.get(photo)).status_code == 200


async def test_the_owner_and_the_player_get_a_working_signed_link(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, player, payment_id, stored = await _receipt_for_review(client, db_session, "a")

    approvals = await client.get(
        "/api/v1/owner/dashboard/pending-approvals", headers=auth_header(owner)
    )
    link = approvals.json()["data"]["items"][0]["receipt_proof_url"]
    assert link.startswith("/api/v1/media/receipts/") and "sig=" in link and "expires=" in link
    assert stored not in link

    picture = await client.get(link)
    assert picture.status_code == 200
    assert picture.headers["content-type"] == "image/png"
    assert picture.headers["cache-control"] == "private, no-store"
    assert picture.headers["x-content-type-options"] == "nosniff"
    assert picture.content.startswith(bytes([0x89]) + b"PNG")

    mine = await client.get("/api/v1/payments/my", headers=auth_header(player))
    assert mine.status_code == 200
    items = mine.json()["data"]["items"]
    player_link = next(p for p in items if p["id"] == payment_id)["receipt_proof_url"]
    assert (await client.get(player_link)).status_code == 200


async def test_a_changed_expired_or_borrowed_link_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _, _, stored = await _receipt_for_review(client, db_session, "b")
    link = receipt_links.signed_link(stored)
    assert link is not None
    parsed = urlparse(link)
    query = parse_qs(parsed.query)
    name = parsed.path.rsplit("/", 1)[1]
    expires, sig = int(query["expires"][0]), query["sig"][0]
    route = "/api/v1/media/receipts"

    flipped = sig[:-1] + ("0" if sig[-1] != "0" else "1")
    assert (await client.get(f"{route}/{name}?expires={expires}&sig={flipped}")).status_code == 404
    later = expires + 3600  # a longer life with the old signature
    assert (await client.get(f"{route}/{name}?expires={later}&sig={sig}")).status_code == 404
    other = "0" * 32 + ".png"  # the signature belongs to one file only
    assert (await client.get(f"{route}/{other}?expires={expires}&sig={sig}")).status_code == 404
    no_sig = await client.get(f"{route}/{name}")
    assert no_sig.status_code in (404, 422)
    traversal = await client.get(f"{route}/..%2F..%2Fapp%2Fmain.py?expires={expires}&sig={sig}")
    assert traversal.status_code == 404

    old = receipt_links.signed_link(stored, now=time.time() - 3600)  # made an hour ago
    assert old is not None
    assert (await client.get(old)).status_code == 404


def test_only_our_receipt_addresses_become_links() -> None:
    assert receipt_links.signed_link(None) is None
    assert receipt_links.signed_link("https://evil.example/x.png") is None
    assert receipt_links.signed_link("/uploads/receipts/../../etc/passwd") is None
    good = receipt_links.signed_link("/uploads/receipts/" + "a" * 32 + ".jpg")
    assert good is not None and good.startswith("/api/v1/media/receipts/" + "a" * 32 + ".jpg?")


@pytest.mark.parametrize("minutes", [receipt_links.LINK_MINUTES])
def test_a_link_lives_for_a_short_time(minutes: int) -> None:
    now = 1_800_000_000.0
    link = receipt_links.signed_link("/uploads/receipts/" + "b" * 32 + ".png", now=now)
    assert link is not None
    expires = int(parse_qs(urlparse(link).query)["expires"][0])
    assert expires == int(now + minutes * 60)
    name = "b" * 32 + ".png"
    sig = parse_qs(urlparse(link).query)["sig"][0]
    assert receipt_links.check(name, expires, sig, now=now + minutes * 60 - 1)
    assert not receipt_links.check(name, expires, sig, now=now + minutes * 60 + 1)
