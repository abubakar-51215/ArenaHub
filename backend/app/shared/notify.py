"""Notification delivery seam. Real push/email/in-app delivery is
``modules/notification/`` (Sprint 5); until then, dev logs the event to the
console — same pattern as ``shared/otp.py``'s OTP console delivery — so
every module that needs to notify someone has a stable call today.
"""

import uuid

import structlog

log = structlog.get_logger()


def notify_user(user_id: uuid.UUID, event: str, **context: object) -> None:
    # structlog's log.info(msg, ...) already binds "event" internally to the
    # message itself, so a caller-supplied "event" kwarg would collide.
    log.info("notify_dev_delivery", user_id=str(user_id), notification_type=event, **context)
