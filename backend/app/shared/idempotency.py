"""Safe retries for booking creation and payment submission (OWASP API6 business flows).

A client may send an ``Idempotency-Key`` header (any random string, 8 to 100 characters). The first
call runs normally and its answer is kept for 24 hours; a repeat of the same call by the same person
gets the same answer back instead of making a second booking or payment. The same key with a
different body is refused. Without the header nothing changes.
"""

import hashlib
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder

from app.cache import redis as redis_cache
from app.core import messages
from app.core.exceptions import ConflictError, ValidationError

TTL_SECONDS = 24 * 60 * 60
_RUNNING = "running"


async def run_once(
    request: Request,
    user_id: uuid.UUID,
    scope: str,
    body: Any,
    action: Callable[[], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    key = request.headers.get("Idempotency-Key")
    if not key or not 8 <= len(key) <= 100:
        return await action()

    redis = redis_cache.get_redis()
    digest = hashlib.sha256(json.dumps(jsonable_encoder(body), sort_keys=True).encode()).hexdigest()
    slot = f"idem:{user_id}:{scope}:{hashlib.sha256(key.encode()).hexdigest()}"
    claimed = await redis.set(
        slot, json.dumps({"state": _RUNNING, "body": digest}), nx=True, ex=TTL_SECONDS
    )
    if not claimed:
        seen = json.loads(await redis.get(slot) or "{}")
        if seen.get("body") != digest:
            raise ValidationError(messages.IDEMPOTENCY_MISMATCH)
        if seen.get("state") == _RUNNING:
            raise ConflictError(messages.IDEMPOTENCY_BUSY)
        return seen["response"]
    try:
        response = jsonable_encoder(await action())
    except BaseException:
        await redis.delete(slot)  # a failed attempt may be retried with the same key
        raise
    await redis.set(
        slot, json.dumps({"state": "done", "body": digest, "response": response}), ex=TTL_SECONDS
    )
    return response
