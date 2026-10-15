"""The audit trail: who did what, when, from where, and whether it worked.

One row of ``audit_logs`` per security-relevant action (sign-ins and failures, password and email
changes, codes asked for, suspensions, approvals, refunds, "mark paid"). The client address and
request id come from the request itself (app/middleware/request_context.py). A row NEVER holds a
password, a code, a token or a bank detail: ``clean`` drops any detail whose name suggests one and
shortens long values, so a careless caller cannot put one in by accident.
"""

import re
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import current_client_ip, current_request_id
from app.modules.admin.model import AuditLog

_SENSITIVE = re.compile(
    r"pass|code|otp|token|secret|hash|authorization|cookie|account_number|iban|card|cvv",
    re.IGNORECASE,
)
_MAX_VALUE = 200


def clean(details: dict[str, Any] | None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in (details or {}).items():
        if _SENSITIVE.search(str(key)):
            continue
        if isinstance(value, str) and len(value) > _MAX_VALUE:
            value = value[:_MAX_VALUE] + "…"
        out[str(key)[:60]] = (
            value if isinstance(value, str | int | float | bool | None) else str(value)
        )
    return out


async def audit(
    db: AsyncSession,
    action: str,
    *,
    actor: Any = None,
    target_type: str = "",
    target_id: str | uuid.UUID = "",
    result: str = "ok",
    details: dict[str, Any] | None = None,
    commit: bool = False,
) -> None:
    """Add one audit row. ``actor`` is a user, a user id or None (nobody signed in).

    ``commit=True`` saves it at once: use it before raising an error, because a request that ends
    in an error rolls back everything else it did, and a failed sign-in must still leave a row.
    """
    actor_id = getattr(actor, "id", actor)
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action[:100],
            target_type=target_type[:50],
            target_id=str(target_id)[:100],
            result=result[:10],
            details=clean(details),
            ip=current_client_ip()[:45] or None,
            request_id=current_request_id()[:64] or None,
        )
    )
    if commit:
        await db.commit()
