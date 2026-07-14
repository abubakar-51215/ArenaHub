"""WebSocket endpoint for live per-court slot updates. Public (read-only,
same visibility as the public slot listing) — no auth required to watch
availability change in real time.
"""

import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/courts/{court_id}/slots")
async def court_slot_updates(websocket: WebSocket, court_id: uuid.UUID) -> None:
    await manager.connect(court_id, websocket)
    try:
        while True:
            # Clients don't need to send anything; this just detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(court_id, websocket)
