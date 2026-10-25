"""Unit tests for the per-court WebSocket broadcast manager.

Uses a lightweight fake WebSocket instead of a real ASGI connection: the
sync ``TestClient`` websocket helper runs its own event loop in a background
thread, which would fight the manager's shared singleton state and the
async test's loop over which loop owns each socket. Testing the manager in
isolation is both simpler and deterministic; the full ASGI wiring is
exercised manually (see the verify skill) since it's inherently a live
feature.
"""

import uuid
from datetime import date, time

from app.websocket.manager import CourtChannelManager, broadcast_slot_status, manager


class FakeWebSocket:
    def __init__(self, fail_on_send: bool = False) -> None:
        self.accepted = False
        self.sent: list[dict] = []
        self.fail_on_send = fail_on_send

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict) -> None:
        if self.fail_on_send:
            raise RuntimeError("connection closed")
        self.sent.append(message)


async def test_connect_then_broadcast_delivers_to_all_subscribers() -> None:
    mgr = CourtChannelManager()
    court_id = uuid.uuid4()
    ws1, ws2 = FakeWebSocket(), FakeWebSocket()

    await mgr.connect(court_id, ws1)  # type: ignore[arg-type]
    await mgr.connect(court_id, ws2)  # type: ignore[arg-type]
    assert ws1.accepted and ws2.accepted

    await mgr.broadcast(court_id, {"type": "slot_update", "status": "booked"})
    assert ws1.sent == [{"type": "slot_update", "status": "booked"}]
    assert ws2.sent == [{"type": "slot_update", "status": "booked"}]


async def test_broadcast_to_other_court_is_not_delivered() -> None:
    mgr = CourtChannelManager()
    court_a, court_b = uuid.uuid4(), uuid.uuid4()
    ws = FakeWebSocket()
    await mgr.connect(court_a, ws)  # type: ignore[arg-type]

    await mgr.broadcast(court_b, {"type": "slot_update"})
    assert ws.sent == []


async def test_disconnect_removes_subscriber() -> None:
    mgr = CourtChannelManager()
    court_id = uuid.uuid4()
    ws = FakeWebSocket()
    await mgr.connect(court_id, ws)  # type: ignore[arg-type]

    mgr.disconnect(court_id, ws)  # type: ignore[arg-type]
    await mgr.broadcast(court_id, {"type": "slot_update"})
    assert ws.sent == []


async def test_dead_socket_is_dropped_without_breaking_broadcast_to_others() -> None:
    mgr = CourtChannelManager()
    court_id = uuid.uuid4()
    dead, alive = FakeWebSocket(fail_on_send=True), FakeWebSocket()
    await mgr.connect(court_id, dead)  # type: ignore[arg-type]
    await mgr.connect(court_id, alive)  # type: ignore[arg-type]

    await mgr.broadcast(court_id, {"type": "slot_update"})
    assert alive.sent == [{"type": "slot_update"}]

    # The dead socket was pruned — a second broadcast doesn't retry it.
    await mgr.broadcast(court_id, {"type": "slot_update"})
    assert alive.sent == [{"type": "slot_update"}] * 2


async def test_broadcast_slot_status_shapes_the_message() -> None:
    court_id = uuid.uuid4()
    slot_id = uuid.uuid4()
    ws = FakeWebSocket()
    await manager.connect(court_id, ws)  # type: ignore[arg-type]

    await broadcast_slot_status(court_id, slot_id, date(2026, 8, 3), time(9, 0), "booked")

    assert ws.sent == [
        {
            "type": "slot_update",
            "court_id": str(court_id),
            "slot_id": str(slot_id),
            "date": "2026-08-03",
            "start_time": "09:00",
            "status": "booked",
        }
    ]
    manager.disconnect(court_id, ws)  # type: ignore[arg-type]


async def test_relayed_update_reaches_local_sockets_but_not_the_senders_own() -> None:
    import json

    from app.websocket import manager as ws

    court = uuid.uuid4()
    sock = FakeWebSocket()
    await ws.manager.connect(court, sock)  # type: ignore[arg-type]
    msg = {"type": "slot_update", "status": "booked"}

    other = json.dumps({"origin": "another-process", "court_id": str(court), "message": msg})
    await ws.deliver_relayed(other)
    assert sock.sent == [msg]

    own = json.dumps({"origin": ws.instance_id(), "court_id": str(court), "message": msg})
    await ws.deliver_relayed(own)
    await ws.deliver_relayed("not json")
    assert sock.sent == [msg]
    ws.manager.disconnect(court, sock)  # type: ignore[arg-type]


def test_each_process_gets_its_own_id_even_after_a_fork(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import os

    from app.websocket import manager as ws

    first = ws.instance_id()
    assert ws.instance_id() == first
    monkeypatch.setattr(os, "getpid", lambda: 999_999)
    assert ws.instance_id() != first


async def test_a_hung_redis_does_not_hold_up_the_broadcast(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import asyncio

    from app.cache import redis as redis_cache
    from app.websocket import manager as ws

    class Hung:
        async def publish(self, *_: object) -> None:
            await asyncio.sleep(30)

    monkeypatch.setattr(redis_cache, "get_redis", lambda: Hung())
    monkeypatch.setattr(ws, "PUBLISH_TIMEOUT_SECONDS", 0.05)
    court, sock = uuid.uuid4(), FakeWebSocket()
    await ws.manager.connect(court, sock)  # type: ignore[arg-type]
    await asyncio.wait_for(
        ws.broadcast_slot_status(court, uuid.uuid4(), date(2026, 11, 1), time(18, 0), "booked"), 2
    )
    assert len(sock.sent) == 1  # local clients were still told
    ws.manager.disconnect(court, sock)  # type: ignore[arg-type]
