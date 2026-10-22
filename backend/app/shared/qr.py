"""QR code generation for confirmed bookings.

The QR encodes a random pass token (``Booking.pass_token``, set once per booking at
confirmation), never the booking's own id. The token has no mathematical relationship
to the id — it can't be derived from it, and nothing about it can be read without a
database lookup, which only ArenaHub's own server can do. Reuses ``shared.storage`` so
the image goes through the same local/Cloudinary seam as arena photos.
"""

import io
import json
import secrets

import qrcode

from app.shared.storage import save_image

PASS_TOKEN_BYTES = 24  # 48 hex characters


def make_pass_token() -> str:
    return secrets.token_hex(PASS_TOKEN_BYTES)


def generate_booking_qr(pass_token: str) -> str:
    """Generate a QR PNG carrying this pass token and return its stored URL."""
    payload = json.dumps({"type": "arenahub_booking_pass", "token": pass_token})
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return save_image(buf.getvalue(), "image/png", folder="misc")
