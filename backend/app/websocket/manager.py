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
"""

import uuid
from datetime import date, time

import structlog
from fastapi import WebSocket

log = structlog.get_logger()


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
    await manager.broadcast(
        court_id,
        {
            "type": "slot_update",
            "court_id": str(court_id),
            "slot_id": str(slot_id),
            "date": slot_date.isoformat(),
            "start_time": start_time.isoformat(timespec="minutes"),
            "status": status,
        },
    )
