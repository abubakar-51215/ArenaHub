/** Player-facing court + slot discovery API calls. */
import { api } from '../lib/api';
import type { Court, PricingRule, TimeSlot } from '../types';

export function listCourts(arenaId: string): Promise<Court[]> {
  return api.get<Court[]>(`/arenas/${arenaId}/courts`);
}

/** A court's active peak-pricing windows. */
export function listPricingRules(courtId: string): Promise<PricingRule[]> {
  return api.get<PricingRule[]>(`/courts/${courtId}/pricing-rules`);
}

/** ``date`` as YYYY-MM-DD. */
export function listSlots(courtId: string, date: string): Promise<TimeSlot[]> {
  return api.get<TimeSlot[]>(`/courts/${courtId}/slots?date=${date}`);
}
