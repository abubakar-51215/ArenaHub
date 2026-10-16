"""A log line with the rupee sign must not crash on a console that cannot write it."""

import io

from app.core.logging import make_stream_safe


def test_a_narrow_console_replaces_what_it_cannot_write() -> None:
    raw = io.BytesIO()
    stream = io.TextIOWrapper(raw, encoding="cp1252")
    make_stream_safe(stream)
    stream.write("Your refund of ₨ 2,000 has been completed.")
    stream.flush()
    assert raw.getvalue().startswith(b"Your refund of ")
    assert b"2,000" in raw.getvalue()
