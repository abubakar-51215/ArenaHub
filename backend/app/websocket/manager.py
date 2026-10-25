"""Per-court WebSocket broadcast (docs/11_BOOKING_ENGINE.md /
MASTER_DEVELOPMENT_PLAN.md Sprint 3: "per-court channel, broadcast slot
changes, auto-reconnect contract").

One channel per court, keyed by court_id. Booking/payment/slot services call
``broadcast_slot`` whenever a slot's status changes (reserved/booked/
available/maintenance) so connected clients repaint availability live instead
of polling. No per-connection state beyond the socket itself is kept, so a
dropped connection just falls off the set — clients are expected to
reconnect (with backoff) and re-fetch the current slot list on reconnect,
since WebSocket delivery here is best-effort, not a message queue with replay.

Several server processes: each one delivers to its own sockets and also
publishes the update on a Redis channel; every other process listens
(``run_relay``) and delivers it to its sockets. A process ignores its own
messages, so nothing arrives twice. If Redis is down, each process still
serves its own clients.
"""

import asyncio
import contextlib
import json
import os
import uuid
from datetime import date, time

import structlog
from fastapi import WebSocket

from app.cache import redis as redis_cache

log = structlog.get_logger()

RELAY_CHANNEL = "arenahub:slot_updates"
PUBLISH_TIMEOUT_SECONDS = (
    3.0  # a hung Redis must not hold up a booking; a cold localhost connect takes ~2 s
)
_instance: tuple[int, str] = (0, "")


def instance_id() -> str:
    """Who published a message, so a process skips its own. Per process id, so workers
    forked after this module was imported (preload) still get different ids."""
    global _instance
    pid = os.getpid()
    if _instance[0] != pid:
        _instance = (pid, f"{pid}-{uuid.uuid4().hex}")
    return _instance[1]


class CourtChannelManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, set[WebSocket]] = {}

    async def connect(self, court_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(court_id, set()).add(websocket)

    def disconnect(self, court_id: uuid.UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(court_id)
        if conns is None:
            return
        conns.discard(websocket)
        if not conns:
            self._connections.pop(court_id, None)

    async def broadcast(self, court_id: uuid.UUID, message: dict) -> None:
        conns = self._connections.get(court_id)
        if not conns:
            return
        # Snapshot before iterating: each send is awaited, and a concurrent
        # disconnect() (from another connection's teardown) mutates this same
        # set — iterating the live set would raise "Set changed size during
        # iteration" once that happens mid-broadcast.
        dead: list[WebSocket] = []
        for ws in list(conns):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001 - a dead socket must not break the broadcast
                dead.append(ws)
        for ws in dead:
            self.disconnect(court_id, ws)


manager = CourtChannelManager()


async def broadcast_slot_status(
    court_id: uuid.UUID, slot_id: uuid.UUID, slot_date: date, start_time: time, status: str
) -> None:
    message = {
        "type": "slot_update",
        "court_id": str(court_id),
        "slot_id": str(slot_id),
        "date": slot_date.isoformat(),
        "start_time": start_time.isoformat(timespec="minutes"),
        "status": status,
    }
    await manager.broadcast(court_id, message)
    try:
        envelope = json.dumps(
            {"origin": instance_id(), "court_id": str(court_id), "message": message}
        )
        await asyncio.wait_for(
            redis_cache.get_redis().publish(RELAY_CHANNEL, envelope), PUBLISH_TIMEOUT_SECONDS
        )
    except Exception as exc:  # noqa: BLE001 - others miss one update; clients refetch on reconnect
        log.warning("slot_relay_publish_failed", error=str(exc))


async def deliver_relayed(raw: str) -> None:
    """Deliver one message published by another process to this process's sockets."""
    try:
        envelope = json.loads(raw)
        if envelope["origin"] == instance_id():
            return
        await manager.broadcast(uuid.UUID(envelope["court_id"]), envelope["message"])
    except (ValueError, KeyError, TypeError):
        log.warning("slot_relay_bad_message")


async def run_relay(retry_seconds: float = 5.0) -> None:
    """Listen for updates from the other processes until cancelled; reconnect if Redis drops."""
    while True:
        pubsub = None
        try:
            pubsub = redis_cache.get_redis().pubsub()
            await pubsub.subscribe(RELAY_CHANNEL)
            async for item in pubsub.listen():
                if item.get("type") == "message":
                    await deliver_relayed(item["data"])
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - keep trying; local delivery works without it
            log.warning("slot_relay_unavailable", error=str(exc))
        finally:
            if pubsub is not None:
                with contextlib.suppress(Exception):
                    await pubsub.aclose()
        await asyncio.sleep(retry_seconds)
