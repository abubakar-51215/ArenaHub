"""Check, with two real processes and the real local Redis, that a slot update made in one
process reaches a socket in another, and that a process never hears its own update twice.

    cd backend && uv run python scripts/check_slot_relay.py

Needs Redis running (REDIS_URL). Prints the start times received: expect 18:00 and 19:00.
"""

import asyncio
import sys
import uuid
from datetime import date, time

from app.websocket import manager as ws


class S:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def accept(self) -> None:
        pass

    async def send_json(self, m: dict) -> None:
        self.sent.append(m)


async def main() -> None:
    court = uuid.uuid4()
    sock = S()
    await ws.manager.connect(court, sock)  # type: ignore[arg-type]
    task = asyncio.create_task(ws.run_relay())
    await asyncio.sleep(1)
    code = (
        "import asyncio,uuid,sys;from datetime import date,time;"
        "from app.websocket import manager as ws;"
        "asyncio.run(ws.broadcast_slot_status(uuid.UUID(sys.argv[1]),uuid.uuid4(),"
        "date(2026,11,1),time(18,0),'booked'))"
    )
    pr = await asyncio.create_subprocess_exec(sys.executable, "-c", code, str(court))
    await pr.wait()
    await asyncio.sleep(1.5)
    # and our own publish must not echo back
    await ws.broadcast_slot_status(court, uuid.uuid4(), date(2026, 11, 1), time(19, 0), "booked")
    await asyncio.sleep(1)
    task.cancel()
    print("received", [m["start_time"] for m in sock.sent])


asyncio.run(main())
