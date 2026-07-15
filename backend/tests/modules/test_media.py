"""Image upload validation: content-type allow-list, size cap, and the
player/owner folder restriction — previously exercised only indirectly
(tests passed fake URL strings straight to receipt_proof_url without ever
hitting this endpoint)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.helpers import auth_header, make_user


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
        files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nfake-but-valid-header", "image/png")},
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
        files={"file": ("court.jpg", b"fake-jpeg-bytes", "image/jpeg")},
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
        files={"file": ("court.jpg", b"fake-jpeg-bytes", "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["url"].startswith("/uploads/arenas/")
