"""QR code generation for confirmed bookings.

The QR encodes the booking id only (already an unguessable UUID4); whoever
scans it (arena staff at check-in) still looks the booking up server-side
and checks its status, so the code itself doesn't need to be cryptographically
signed — same trust model as a plain ticket barcode. Reuses ``shared.storage``
so the image goes through the same local/Cloudinary seam as arena photos.
"""

import io
import json
import uuid

import qrcode

from app.shared.storage import save_image


def generate_booking_qr(booking_id: uuid.UUID) -> str:
    """Generate a QR PNG for a booking and return its stored URL."""
    payload = json.dumps({"type": "arenahub_booking", "booking_id": str(booking_id)})
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return save_image(buf.getvalue(), "image/png", folder="misc")
