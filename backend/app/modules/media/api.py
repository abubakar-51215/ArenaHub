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

from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.user.model import User, UserRole
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


@router.post("/image", summary="Upload an image and get its URL")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = "arenas",
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if user.role not in (UserRole.owner, UserRole.admin) and folder not in _PLAYER_ALLOWED_FOLDERS:
        raise ForbiddenError("Players may only upload to the receipts or avatars folders.")
    content = await _read_bounded(file)
    url = save_image(content, file.content_type or "", folder=folder)
    return success(data={"url": url}, message="Image uploaded.")
