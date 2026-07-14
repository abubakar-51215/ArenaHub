/** Player-facing court + slot discovery API calls. */
import { api } from '../lib/api';
import type { Court, TimeSlot } from '../types';

export function listCourts(arenaId: string): Promise<Court[]> {
  return api.get<Court[]>(`/arenas/${arenaId}/courts`);
}

/** ``date`` as YYYY-MM-DD. */
export function listSlots(courtId: string, date: string): Promise<TimeSlot[]> {
  return api.get<TimeSlot[]>(`/courts/${courtId}/slots?date=${date}`);
}
