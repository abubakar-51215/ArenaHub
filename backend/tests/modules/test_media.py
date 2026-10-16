"""Image upload validation: content-type allow-list, size cap, and the
player/owner folder restriction — previously exercised only indirectly
(tests passed fake URL strings straight to receipt_proof_url without ever
hitting this endpoint)."""

import io
from pathlib import Path

from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from tests.helpers import auth_header, make_user

PNG_HEADER = bytes([0x89]) + b"PNG" + bytes([13, 10, 26, 10])


def real_image(fmt: str = "PNG", exif: bool = False) -> bytes:
    """A small genuine picture (the server now decodes what it is sent)."""
    image = Image.new("RGB", (8, 8), (200, 30, 30))
    out = io.BytesIO()
    if exif and fmt == "JPEG":
        data = Image.Exif()
        data[0x010F] = "SecretPhoneMaker"
        data[0x8825] = {1: "N", 2: (31.0, 33.0, 0.0), 3: "E", 4: (74.0, 21.0, 0.0)}  # GPS
        image.save(out, format="JPEG", exif=data)
    else:
        image.save(out, format=fmt)
    return out.getvalue()


async def test_rejects_unsupported_content_type(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer1@example.com")
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "avatars"},
        files={"file": ("shell.exe", b"MZ-not-an-image", "application/x-msdownload")},
    )
    assert resp.status_code == 422
    assert "Unsupported image type" in resp.json()["message"]


async def test_rejects_oversized_image(client: AsyncClient, db_session: AsyncSession) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer2@example.com")
    oversized = b"\xff" * (5 * 1024 * 1024 + 1)
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "avatars"},
        files={"file": ("big.jpg", oversized, "image/jpeg")},
    )
    assert resp.status_code == 422
    assert "too large" in resp.json()["message"]


async def test_accepts_valid_image_and_returns_url(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer3@example.com")
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "avatars"},
        files={"file": ("avatar.png", real_image("PNG"), "image/png")},
    )
    assert resp.status_code == 200
    url = resp.json()["data"]["url"]
    assert url.startswith("/uploads/avatars/")
    assert url.endswith(".png")


async def test_player_cannot_upload_to_arena_folder(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer4@example.com")
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "arenas"},
        files={"file": ("court.jpg", real_image("JPEG"), "image/jpeg")},
    )
    assert resp.status_code == 403


async def test_owner_can_upload_to_arena_folder(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner, _ = await make_user(client, db_session, "mediaowner1@example.com", "owner")
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(owner),
        params={"folder": "arenas"},
        files={"file": ("court.jpg", real_image("JPEG"), "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["url"].startswith("/uploads/arenas/")


async def test_an_empty_file_says_what_to_choose(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer-empty@example.com")
    for folder, message in (
        ("receipts", "Choose a photo of your receipt (JPG or PNG, up to 5 MB)."),
        ("avatars", "Choose a photo (JPG or PNG, up to 5 MB)."),
    ):
        resp = await client.post(
            "/api/v1/uploads/image",
            headers=auth_header(player),
            params={"folder": folder},
            files={"file": ("empty.png", b"", "image/png")},
        )
        assert resp.status_code == 422
        assert resp.json()["message"] == message


async def test_location_and_device_data_is_removed_from_a_photo(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer-exif@example.com")
    original = real_image("JPEG", exif=True)
    assert b"SecretPhoneMaker" in original
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "receipts"},
        files={"file": ("r.jpg", original, "image/jpeg")},
    )
    assert resp.status_code == 200
    url = resp.json()["data"]["url"]
    stored = (Path(get_settings().media_root) / url.split("/uploads/", 1)[1]).read_bytes()
    assert b"SecretPhoneMaker" not in stored
    with Image.open(io.BytesIO(stored)) as image:
        assert not image.getexif()
        assert image.size == (8, 8)


async def test_a_file_with_an_image_header_but_no_picture_is_refused(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    player, _ = await make_user(client, db_session, "mediaplayer-fake@example.com")
    resp = await client.post(
        "/api/v1/uploads/image",
        headers=auth_header(player),
        params={"folder": "avatars"},
        files={"file": ("a.png", PNG_HEADER + b"<script>alert(1)</script>", "image/png")},
    )
    assert resp.status_code == 422
