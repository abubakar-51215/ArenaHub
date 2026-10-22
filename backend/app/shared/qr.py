"""QR code generation for confirmed bookings.

The QR encodes a random pass token (``Booking.pass_token``, set once per booking at
confirmation), never the booking's own id. The token has no mathematical relationship
to the id — it can't be derived from it, and nothing about it can be read without a
database lookup, which only ArenaHub's own server can do.

The QR image itself is generated in memory and returned as a data URI, never written
to disk or Cloudinary: a saved file would sit at a public address (even an unguessable
one), reachable by anyone who ever obtained the link, forever. Generating it fresh on
each ``GET /bookings/{id}/pass`` call means the token's secrecy is the only thing that
protects the pass, not an extra public copy of it sitting in storage. Rows confirmed
before this change keep whatever public ``qr_code_url`` they already have (see
``modules/booking/service.get_booking_pass``) — nothing is backfilled or deleted.
"""

import base64
import io
import json
import secrets

import qrcode

PASS_TOKEN_BYTES = 24  # 48 hex characters


def make_pass_token() -> str:
    return secrets.token_hex(PASS_TOKEN_BYTES)


def generate_booking_qr_data_uri(pass_token: str) -> str:
    """Build a QR PNG carrying this pass token and return it inline as a data URI.
    Never persisted anywhere — the caller discards it once the response is sent."""
    payload = json.dumps({"type": "arenahub_booking_pass", "token": pass_token})
    img = qrcode.make(payload)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
