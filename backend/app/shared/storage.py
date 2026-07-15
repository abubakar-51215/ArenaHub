"""Image storage seam.

The *interface* is stable; only the backing store changes by environment
(mirrors ``shared/otp.py``). In dev, images are written to the local
filesystem under ``settings.media_root`` and served from ``media_url_prefix``;
in prod the same call will upload to Cloudinary (wired with the notification /
media work later — ``save_image`` is the single seam it plugs into).

Only a small allow-list of image types is accepted so an owner can't smuggle
arbitrary files through the upload endpoint.
"""

import uuid
from pathlib import Path

import structlog

from app.core.config import get_settings
from app.core.exceptions import ValidationError

log = structlog.get_logger()

# content-type -> file extension. The allow-list doubles as validation.
ALLOWED_IMAGE_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

# Folders images may be filed under — an allow-list so a caller-supplied folder
# can never traverse outside media_root.
ALLOWED_FOLDERS = frozenset({"arenas", "courts", "misc", "receipts", "avatars"})


def _validate(content: bytes, content_type: str) -> str:
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Unsupported image type. Use JPEG, PNG, or WebP.")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValidationError("Image is too large (max 5 MB).")
    return ALLOWED_IMAGE_TYPES[content_type]


def save_image(content: bytes, content_type: str, *, folder: str = "arenas") -> str:
    """Persist an uploaded image and return a servable URL.

    Raises ``ValidationError`` for an unsupported type or oversized file.
    """
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError("Invalid upload folder.")
    ext = _validate(content, content_type)
    settings = get_settings()
    name = f"{uuid.uuid4().hex}{ext}"

    if settings.is_dev or settings.cloudinary_url is None:
        dest_dir = Path(settings.media_root) / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        (dest_dir / name).write_bytes(content)
        url = f"{settings.media_url_prefix}/{folder}/{name}"
        log.info("image_saved_local", folder=folder, url=url, bytes=len(content))
        return url

    # Real Cloudinary upload lands with the media integration work.
    log.info("image_upload_requested", folder=folder, bytes=len(content))
    raise ValidationError("Remote image upload is not configured.")
