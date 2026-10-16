"""Image storage seam.

The *interface* is stable; only the backing store changes by environment
(mirrors ``shared/otp.py``). In dev (or when ``CLOUDINARY_URL`` is unset) images
are written to the local filesystem under ``settings.media_root`` and served
from ``media_url_prefix``; in prod the same call uploads to Cloudinary.

Only a small allow-list of image types is accepted so an owner can't smuggle
arbitrary files through the upload endpoint.

Public vs. private:
* Public pictures (arenas, courts, avatars, misc) upload as Cloudinary
  ``type="upload"`` and the returned value is the public ``secure_url``.
* Receipts upload as Cloudinary ``type="authenticated"`` and the returned value
  is still ``/uploads/receipts/<hex>.<ext>`` — the same shape as local storage —
  so the database and the existing short-lived signed-link flow
  (``shared/receipt_links.py``) do not change. The Cloudinary authenticated URL
  is minted server-side only (``cloudinary_receipt_fetch_url``) and never handed
  to a viewer: a receipt has no public address.
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

# The one folder whose pictures are private (bank-transfer receipts). It uploads
# as Cloudinary "authenticated" and is only ever served through a signed link.
PRIVATE_FOLDER = "receipts"

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


# ---- Cloudinary ------------------------------------------------------------
#
# The SDK is configured lazily from CLOUDINARY_URL and cached. Receipts expose a
# short-lived (signed, authenticated) delivery URL used only inside the media
# route; public pictures expose their secure_url directly.

_RECEIPT_URL_MINUTES = 15  # matches receipt_links.LINK_MINUTES


def _configure_cloudinary() -> None:
    import cloudinary

    # cloudinary.config() reads CLOUDINARY_URL from the environment; pass it
    # explicitly so we don't depend on it being exported into os.environ.
    url = get_settings().cloudinary_url
    cloudinary.config(cloudinary_url=url, secure=True)


def _public_id_for(folder: str, name_no_ext: str) -> str:
    """Deterministic public id: ``<folder>/<hex>`` (mirrors the local layout)."""
    return f"{folder}/{name_no_ext}"


def parse_cloudinary_url(url: str) -> tuple[str, str] | None:
    """``(public_id, delivery_type)`` for a Cloudinary delivery URL, else None.

    Handles ``.../image/upload/v123/folder/id.jpg`` and the authenticated form
    ``.../image/authenticated/s--sig--/v123/folder/id.jpg``. Used to rebuild a
    link or to delete the asset.
    """
    if "res.cloudinary.com" not in url:
        return None
    for delivery in ("upload", "authenticated", "private"):
        marker = f"/image/{delivery}/"
        if marker not in url:
            continue
        tail = url.split(marker, 1)[1]
        # drop an optional signature segment (s--xxxx--) and version segment (v123)
        parts = [p for p in tail.split("/") if p]
        if parts and parts[0].startswith("s--") and parts[0].endswith("--"):
            parts = parts[1:]
        if parts and parts[0].startswith("v") and parts[0][1:].isdigit():
            parts = parts[1:]
        if not parts:
            return None
        public_with_ext = "/".join(parts)
        public_id = public_with_ext.rsplit(".", 1)[0]
        return public_id, delivery
    return None


def cloudinary_receipt_fetch_url(name: str) -> str | None:
    """A short-lived, signed, *authenticated* Cloudinary URL for a receipt file
    name (``<hex>.<ext>``), for the server to fetch and stream. Returns None when
    not on Cloudinary. This URL is never sent to a viewer."""
    if uses_local_disk():
        return None
    import time

    from cloudinary.utils import cloudinary_url

    _configure_cloudinary()
    name_no_ext = name.rsplit(".", 1)[0]
    public_id = _public_id_for(PRIVATE_FOLDER, name_no_ext)
    built, _ = cloudinary_url(
        public_id,
        resource_type="image",
        type="authenticated",
        sign_url=True,
        secure=True,
        expires_at=int(time.time()) + _RECEIPT_URL_MINUTES * 60,
    )
    return str(built)


def _upload_to_cloudinary(content: bytes, folder: str, name: str) -> str:
    import cloudinary.uploader

    _configure_cloudinary()
    name_no_ext = name.rsplit(".", 1)[0]
    public_id = _public_id_for(folder, name_no_ext)
    is_private = folder == PRIVATE_FOLDER
    result = cloudinary.uploader.upload(
        io.BytesIO(content),
        public_id=public_id,
        resource_type="image",
        type="authenticated" if is_private else "upload",
        overwrite=False,
        unique_filename=False,
        use_filename=False,
        invalidate=True,
    )
    if is_private:
        # Keep the stored reference storage-agnostic so the DB and the existing
        # signed-link flow don't change; the public_id is recoverable from it.
        settings = get_settings()
        return f"{settings.media_url_prefix}/{folder}/{name}"
    url = result.get("secure_url")
    if not url:
        raise ValidationError("Image upload failed.")
    return str(url)


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

    url = _upload_to_cloudinary(content, folder, name)
    log.info("image_saved_cloudinary", folder=folder, bytes=len(content))
    return url


def delete_image(url: str | None) -> None:
    """Delete a stored image from its backing store. Safe to call with None or an
    unrecognised URL (does nothing). Used when a picture is replaced or removed."""
    if not url:
        return
    settings = get_settings()
    # Local disk (also covers receipts, whose stored URL is always /uploads/...).
    prefix = f"{settings.media_url_prefix}/"
    if url.startswith(prefix):
        rel = url[len(prefix) :]
        folder, _, name = rel.partition("/")
        if folder in ALLOWED_FOLDERS and name:
            local = Path(settings.media_root) / folder / name
            if local.is_file():
                local.unlink()
                return
            # Not on disk: a receipt stored in Cloudinary as authenticated.
            if folder == PRIVATE_FOLDER and not uses_local_disk():
                _destroy_cloudinary(_public_id_for(folder, name.rsplit(".", 1)[0]), "authenticated")
        return
    # A public Cloudinary URL stored directly (arenas/courts/avatars/misc).
    parsed = parse_cloudinary_url(url)
    if parsed is not None:
        _destroy_cloudinary(*parsed)


def _destroy_cloudinary(public_id: str, delivery_type: str) -> None:
    import cloudinary.uploader

    _configure_cloudinary()
    try:
        cloudinary.uploader.destroy(public_id, resource_type="image", type=delivery_type)
    except Exception as exc:  # deletion is best-effort; never block the request
        log.warning("image_delete_failed", error=str(exc))
