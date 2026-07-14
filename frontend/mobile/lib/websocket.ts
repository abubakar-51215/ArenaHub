/**
 * Per-court slot WebSocket URL — mounted without the /api/v1 prefix
 * (backend/app/websocket/api.py). Broadcasts `{type:"slot_update", court_id,
 * slot_id, date, start_time, status}` whenever a slot's status changes.
 * Delivery is best-effort, not queued/replayed — reconnect on drop and
 * re-fetch the current slot list rather than assume you can catch up.
 */
import { API_URL } from './config';

export interface SlotUpdateMessage {
  type: 'slot_update';
  court_id: string;
  slot_id: string;
  date: string;
  start_time: string;
  status: 'available' | 'reserved' | 'booked' | 'maintenance';
}

export function courtSlotsWsUrl(courtId: string): string {
  return `${API_URL.replace(/^http/, 'ws')}/ws/courts/${courtId}/slots`;
}
