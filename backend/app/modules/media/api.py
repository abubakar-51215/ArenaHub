"""Image upload endpoint.

Owners and admins upload arena/court images here and receive a URL to store in
the arena/court ``images`` array. Backed by the ``shared.storage`` seam (local
filesystem in dev, Cloudinary in prod).
"""

from typing import Any

from fastapi import APIRouter, Depends, File, UploadFile

from app.modules.user.model import User
from app.shared.auth import require_role
from app.shared.response import success
from app.shared.storage import save_image

router = APIRouter(prefix="/uploads", tags=["uploads"])

_owner_or_admin = require_role("owner", "admin")


@router.post("/image", summary="Upload an image and get its URL")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = "arenas",
    _user: User = Depends(_owner_or_admin),
) -> dict[str, Any]:
    content = await file.read()
    url = save_image(content, file.content_type or "", folder=folder)
    return success(data={"url": url}, message="Image uploaded.")
