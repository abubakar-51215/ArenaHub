"""Image upload endpoint.

Owners and admins upload arena/court images here and receive a URL to store in
the arena/court ``images`` array. Backed by the ``shared.storage`` seam (local
filesystem in dev, Cloudinary in prod).

Any authenticated user may also upload to the ``receipts`` folder — a player
attaching a bank_transfer receipt photo (payment module) isn't an owner/admin,
but still needs a URL to hand to ``POST /payments/{id}/receipt`` — and to the
``avatars`` folder for their profile picture (set via ``PUT /users/me``).
Every other folder (arena/court images) stays owner/admin-only.
"""

from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse, Response

from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.modules.user.model import User, UserRole
from app.shared import abuse, receipt_links, storage
from app.shared.auth import get_current_user
from app.shared.response import success
from app.shared.storage import MAX_IMAGE_BYTES, save_image

router = APIRouter(prefix="/uploads", tags=["uploads"])

_PLAYER_ALLOWED_FOLDERS = frozenset({"receipts", "avatars"})
_CHUNK_SIZE = 256 * 1024  # 256 KB


async def _read_bounded(file: UploadFile) -> bytes:
    """Reads the upload in chunks, aborting as soon as the size cap is
    exceeded — an oversized file is rejected without ever buffering the
    whole thing in memory (the previous `await file.read()` bought nothing
    from the size check that ran after it had already finished)."""
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_CHUNK_SIZE):
        total += len(chunk)
        if total > MAX_IMAGE_BYTES:
            raise ValidationError("Image is too large (max 5 MB).")
        chunks.append(chunk)
    return b"".join(chunks)


@router.post(
    "/image",
    summary="Upload an image and get its URL",
    dependencies=[Depends(abuse.per_user("upload", 40, 3600))],
)
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Query("arenas", max_length=30),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if user.role not in (UserRole.owner, UserRole.admin) and folder not in _PLAYER_ALLOWED_FOLDERS:
        raise ForbiddenError("Players may only upload to the receipts or avatars folders.")
    content = await _read_bounded(file)
    url = save_image(content, file.content_type or "", folder=folder)
    return success(data={"url": url}, message="Image uploaded.")


# ---- private receipts: only through a signed, short-lived link (app/shared/receipt_links.py) ----

receipt_router = APIRouter(prefix="/media", tags=["uploads"])


@receipt_router.get("/receipts/{name}", summary="A receipt picture, through a signed link")
async def receipt_picture(
    name: str,
    expires: int = Query(..., ge=0),
    sig: str = Query(..., min_length=64, max_length=64),
) -> Response:
    # one answer for a bad name, a wrong or expired signature and a missing file
    if not receipt_links.check(name, expires, sig):
        raise NotFoundError("Receipt not found.")
    media_type = _RECEIPT_TYPES[Path(name).suffix]
    headers = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    }

    # Local disk (dev, or any receipt saved before Cloudinary).
    path = receipt_links.receipt_path(name)
    if path.is_file():
        return FileResponse(path, media_type=media_type, headers=headers)

    # Cloudinary-backed receipt: fetch the authenticated image server-side with a
    # short-lived signed URL (built by us, not from any user input) and stream the
    # bytes. The Cloudinary URL is never sent to the viewer.
    fetch_url = storage.cloudinary_receipt_fetch_url(name)
    if fetch_url is not None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            upstream = await client.get(fetch_url)
        if upstream.status_code == 200:
            return Response(content=upstream.content, media_type=media_type, headers=headers)

    raise NotFoundError("Receipt not found.")


_RECEIPT_TYPES = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
