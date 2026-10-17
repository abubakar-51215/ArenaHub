"""Cloudinary storage branch, exercised with a fake SDK (no real network).

Dev uses local disk, so these tests force the Cloudinary path by stubbing
``uses_local_disk`` to False and ``_configure_cloudinary`` to a no-op, then
replace the three Cloudinary SDK calls the code makes
(``uploader.upload``, ``uploader.destroy``, ``utils.cloudinary_url``) with
recorders. Nothing leaves the machine.
"""

import io
from typing import Any

import pytest
from PIL import Image

from app.core.exceptions import ValidationError
from app.shared import storage


def _png() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (8, 8), (10, 20, 30)).save(out, format="PNG")
    return out.getvalue()


class _FakeUploader:
    def __init__(self) -> None:
        self.uploads: list[dict] = []
        self.destroys: list[dict] = []

    def upload(self, _file: Any, **kwargs: Any) -> dict[str, str]:
        self.uploads.append(kwargs)
        public_id = kwargs["public_id"]
        delivery = kwargs["type"]
        return {
            "secure_url": f"https://res.cloudinary.com/demo/image/{delivery}/v1/{public_id}.png",
            "public_id": public_id,
        }

    def destroy(self, public_id: Any, **kwargs: Any) -> dict[str, str]:
        self.destroys.append({"public_id": public_id, **kwargs})
        return {"result": "ok"}


@pytest.fixture
def cloud(monkeypatch: pytest.MonkeyPatch) -> _FakeUploader:
    fake = _FakeUploader()
    monkeypatch.setattr(storage, "uses_local_disk", lambda: False)
    monkeypatch.setattr(storage, "_configure_cloudinary", lambda: None)

    import cloudinary.uploader
    import cloudinary.utils

    monkeypatch.setattr(cloudinary.uploader, "upload", fake.upload)
    monkeypatch.setattr(cloudinary.uploader, "destroy", fake.destroy)

    def fake_url(public_id: Any, **kwargs: Any) -> tuple[str, dict[str, Any]]:
        return (
            f"https://res.cloudinary.com/demo/image/{kwargs['type']}/s--sig--/v1/{public_id}.png",
            kwargs,
        )

    monkeypatch.setattr(cloudinary.utils, "cloudinary_url", fake_url)
    return fake


def test_public_upload_returns_cloudinary_secure_url(cloud: _FakeUploader) -> None:
    url = storage.save_image(_png(), "image/png", folder="arenas")
    assert url.startswith("https://res.cloudinary.com/demo/image/upload/")
    assert cloud.uploads[0]["type"] == "upload"
    assert cloud.uploads[0]["public_id"].startswith("arenas/")


def test_receipt_is_authenticated_and_stored_local_shaped(cloud: _FakeUploader) -> None:
    url = storage.save_image(_png(), "image/png", folder="receipts")
    # stored reference is storage-agnostic so the DB + signed-link flow don't change
    assert url.startswith("/uploads/receipts/") and url.endswith(".png")
    assert cloud.uploads[0]["type"] == "authenticated"
    assert cloud.uploads[0]["public_id"].startswith("receipts/")


def test_receipt_fetch_url_is_signed_authenticated_and_expiring(cloud: _FakeUploader) -> None:
    fetch = storage.cloudinary_receipt_fetch_url("a" * 32 + ".jpg")
    assert fetch is not None and "authenticated" in fetch and "s--sig--" in fetch


def test_receipt_fetch_url_passes_expiry_and_signing(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}
    monkeypatch.setattr(storage, "uses_local_disk", lambda: False)
    monkeypatch.setattr(storage, "_configure_cloudinary", lambda: None)
    import cloudinary.utils

    def fake_url(public_id: Any, **kwargs: Any) -> tuple[str, dict[str, Any]]:
        captured.update(public_id=public_id, **kwargs)
        return ("https://res.cloudinary.com/demo/image/authenticated/s--x--/v1/x.png", kwargs)

    monkeypatch.setattr(cloudinary.utils, "cloudinary_url", fake_url)
    storage.cloudinary_receipt_fetch_url("b" * 32 + ".png")
    assert captured["type"] == "authenticated"
    assert captured["sign_url"] is True
    assert captured["expires_at"] > 0
    assert captured["public_id"] == "receipts/" + "b" * 32


def test_delete_public_image_destroys_parsed_public_id(cloud: _FakeUploader) -> None:
    storage.delete_image("https://res.cloudinary.com/demo/image/upload/v9/arenas/abc.png")
    assert cloud.destroys[0]["public_id"] == "arenas/abc"
    assert cloud.destroys[0]["type"] == "upload"


def test_delete_receipt_destroys_authenticated(cloud: _FakeUploader) -> None:
    storage.delete_image("/uploads/receipts/" + "c" * 32 + ".jpg")
    assert cloud.destroys[0]["public_id"] == "receipts/" + "c" * 32
    assert cloud.destroys[0]["type"] == "authenticated"


def test_parse_authenticated_url_strips_signature_and_version() -> None:
    parsed = storage.parse_cloudinary_url(
        "https://res.cloudinary.com/demo/image/authenticated/s--AbC12--/v1700/receipts/xy.png"
    )
    assert parsed == ("receipts/xy", "authenticated")


def test_unrecognised_url_delete_is_a_noop(cloud: _FakeUploader) -> None:
    storage.delete_image("https://example.com/not-cloudinary.png")
    storage.delete_image(None)
    assert cloud.destroys == []


def test_bad_file_is_refused_before_any_upload(cloud: _FakeUploader) -> None:
    with pytest.raises(ValidationError):
        storage.save_image(b"<not an image>", "image/png", folder="arenas")
    assert cloud.uploads == []
