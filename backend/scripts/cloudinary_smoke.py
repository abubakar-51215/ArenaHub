"""Manual smoke test for Cloudinary. NOT part of the test suite, never runs in CI.

Run it yourself after putting your real CLOUDINARY_URL in backend/.env:

    uv run python scripts/cloudinary_smoke.py

It uploads one public picture and one private ("authenticated") receipt to your
real Cloudinary account, then checks three things:

  1. the public picture opens over https,
  2. the receipt is refused without a signed link,
  3. the receipt opens with a signed link,

and finally deletes both. It prints PASS / FAIL for each check only — never the
key, and never a URL (a signed URL contains a signature), so nothing secret is
shown. Exit code is 0 only if every check passed.
"""

import io
import urllib.error
import urllib.request
import uuid

from app.core.config import get_settings


def _png() -> bytes:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (16, 16), (30, 90, 40)).save(out, format="PNG")
    return out.getvalue()


def _status(url: str) -> int:
    """HTTP status for a GET, turning 4xx/5xx into their code instead of raising."""
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:  # noqa: S310 - our own Cloudinary URL
            return int(resp.status)
    except urllib.error.HTTPError as exc:
        return int(exc.code)
    except urllib.error.URLError:
        return 0


def _check(label: str, passed: bool) -> bool:
    print(f"  [{'PASS' if passed else 'FAIL'}] {label}")
    return passed


def main() -> int:
    if not get_settings().cloudinary_url:
        print("CLOUDINARY_URL is not set in backend/.env - nothing to test.")
        return 1

    import cloudinary
    import cloudinary.uploader
    import cloudinary.utils

    from app.shared.storage import _configure_cloudinary

    _configure_cloudinary()

    tag = uuid.uuid4().hex[:10]
    pub_id = f"arenahub_smoke/public_{tag}"
    rcpt_id = f"arenahub_smoke/receipt_{tag}"
    png = _png()
    ok = True

    print("Cloudinary smoke test:")
    try:
        pub = cloudinary.uploader.upload(
            io.BytesIO(png), public_id=pub_id, resource_type="image", type="upload", overwrite=True
        )
        ok &= _check("public picture opens over https", _status(str(pub["secure_url"])) == 200)

        cloudinary.uploader.upload(
            io.BytesIO(png),
            public_id=rcpt_id,
            resource_type="image",
            type="authenticated",
            overwrite=True,
        )
        unsigned, _ = cloudinary.utils.cloudinary_url(
            rcpt_id, resource_type="image", type="authenticated", secure=True
        )
        ok &= _check("receipt refused without a signed link", _status(str(unsigned)) in (401, 403))

        signed, _ = cloudinary.utils.cloudinary_url(
            rcpt_id, resource_type="image", type="authenticated", sign_url=True, secure=True
        )
        ok &= _check("receipt opens with a signed link", _status(str(signed)) == 200)
    finally:
        pub_del = cloudinary.uploader.destroy(pub_id, resource_type="image", type="upload")
        rcpt_del = cloudinary.uploader.destroy(rcpt_id, resource_type="image", type="authenticated")
        deleted = pub_del.get("result") == "ok" and rcpt_del.get("result") == "ok"
        ok &= _check("both pictures deleted", deleted)

    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
