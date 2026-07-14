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

from app.core.exceptions import ForbiddenError
from app.modules.user.model import User, UserRole
from app.shared.auth import get_current_user
from app.shared.response import success
from app.shared.storage import save_image

router = APIRouter(prefix="/uploads", tags=["uploads"])

_PLAYER_ALLOWED_FOLDERS = frozenset({"receipts", "avatars"})


@router.post("/image", summary="Upload an image and get its URL")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = "arenas",
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if user.role not in (UserRole.owner, UserRole.admin) and folder not in _PLAYER_ALLOWED_FOLDERS:
        raise ForbiddenError("Players may only upload to the receipts or avatars folders.")
    content = await file.read()
    url = save_image(content, file.content_type or "", folder=folder)
    return success(data={"url": url}, message="Image uploaded.")
