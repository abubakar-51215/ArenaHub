"""Image storage seam.

The *interface* is stable; only the backing store changes by environment
(mirrors ``shared/otp.py``). In dev, images are written to the local
filesystem under ``settings.media_root`` and served from ``media_url_prefix``;
in prod the same call will upload to Cloudinary (wired with the notification /
media work later — ``save_image`` is the single seam it plugs into).

Only a small allow-list of image types is accepted so an owner can't smuggle
arbitrary files through the upload endpoint.
"""

import io
import uuid
from pathlib import Path

import structlog
from PIL import Image, ImageOps, UnidentifiedImageError

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

# Magic-byte signatures for each allowed type — the Content-Type header is
# client-supplied and trivially spoofed, so the actual bytes must agree with
# what's claimed before anything is written to disk/served back to users.
_MAGIC_BYTES: dict[str, tuple[bytes, ...]] = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    # RIFF????WEBP — the 4 bytes after "RIFF" are a little-endian size field,
    # so only the leading/trailing markers are checked.
    "image/webp": (b"RIFF",),
}


def _validate(content: bytes, content_type: str) -> str:
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Unsupported image type. Use JPEG, PNG, or WebP.")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValidationError("Image is too large (max 5 MB).")
    signatures = _MAGIC_BYTES[content_type]
    if not any(content.startswith(sig) for sig in signatures):
        raise ValidationError("File content does not match the declared image type.")
    if content_type == "image/webp" and content[8:12] != b"WEBP":
        raise ValidationError("File content does not match the declared image type.")
    return ALLOWED_IMAGE_TYPES[content_type]


# A picture bigger than this many pixels is refused before it is decoded (decompression bombs).
MAX_PIXELS = 40_000_000
_PIL_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def strip_metadata(content: bytes, content_type: str) -> bytes:
    """The picture again without its hidden data (EXIF: phone location, device, time).

    The photo is decoded and saved fresh, so anything else riding along in the file (extra
    chunks, trailing bytes, comments) goes too. A turned phone photo is turned the right way
    first, so it still looks the same.
    """
    try:
        Image.MAX_IMAGE_PIXELS = MAX_PIXELS
        with Image.open(io.BytesIO(content)) as image:
            image.load()
            fixed = ImageOps.exif_transpose(image)
            out = io.BytesIO()
            fmt = _PIL_FORMAT[content_type]
            if fmt == "JPEG" and fixed.mode not in ("RGB", "L"):
                fixed = fixed.convert("RGB")
            kwargs = {"quality": 90} if fmt in ("JPEG", "WEBP") else {}
            fixed.save(out, format=fmt, **kwargs)  # no exif= argument: nothing is carried over
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise ValidationError("File content does not match the declared image type.") from exc


def uses_local_disk() -> bool:
    """Whether pictures are written to this server's disk (development, or no CLOUDINARY_URL).
    Outside development that is a go-live blocker: see docs/BEFORE_GOING_LIVE.md."""
    settings = get_settings()
    return settings.is_dev or settings.cloudinary_url is None


def save_image(content: bytes, content_type: str, *, folder: str = "arenas") -> str:
    """Persist an uploaded image and return a servable URL.

    Raises ``ValidationError`` for an unsupported type or oversized file.
    """
    if folder not in ALLOWED_FOLDERS:
        raise ValidationError("Invalid upload folder.")
    if not content:
        # nothing chosen, or a 0-byte file: say what to choose, not a technical reason
        raise ValidationError(
            "Choose a photo of your receipt (JPG or PNG, up to 5 MB)."
            if folder == "receipts"
            else "Choose a photo (JPG or PNG, up to 5 MB)."
        )
    ext = _validate(content, content_type)
    content = strip_metadata(content, content_type)
    settings = get_settings()
    name = f"{uuid.uuid4().hex}{ext}"

    if uses_local_disk():
        dest_dir = Path(settings.media_root) / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        (dest_dir / name).write_bytes(content)
        url = f"{settings.media_url_prefix}/{folder}/{name}"
        log.info("image_saved_local", folder=folder, url=url, bytes=len(content))
        return url

    # Real Cloudinary upload lands with the media integration work.
    log.info("image_upload_requested", folder=folder, bytes=len(content))
    raise ValidationError("Remote image upload is not configured.")
