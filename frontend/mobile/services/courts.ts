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

/** One court's open slots left today (the Arena screen's Courts rows). */
export interface CourtToday {
  court_id: string;
  open_count: number;
  lowest_price: string | null;
}

export function getSlotsToday(arenaId: string): Promise<CourtToday[]> {
  return api.get<CourtToday[]>(`/arenas/${arenaId}/slots-today`);
}

/** Open slot count for one date (the strip's dot). */
export interface DayAvailability {
  date: string;
  open_count: number;
}

export function getAvailability(courtId: string, from: string, to: string): Promise<DayAvailability[]> {
  return api.get<DayAvailability[]>(`/courts/${courtId}/availability?from=${from}&to=${to}`);
}
