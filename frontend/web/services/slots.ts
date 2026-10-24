/** Owner slot management API calls (backend modules/slot). */
import { api } from "@/services/api";

export type SlotStatus = "available" | "reserved" | "booked" | "maintenance";

export interface Slot {
  id: string;
  court_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: SlotStatus;
  price: string;
  /** the live booking using this slot (held or booked), for the "View booking" link */
  booking_id: string | null;
}

export interface GenerateSlotsResult {
  created: number;
  skipped_existing: number;
  skipped_closed_or_blocked: string[];
  skipped_window_too_short: string[];
}

export function listOwnerSlots(courtId: string, date: string): Promise<Slot[]> {
  return api.get<Slot[]>(`/owner/courts/${courtId}/slots?date=${date}`);
}

export function generateSlots(
  courtId: string,
  range: { start_date: string; end_date: string },
): Promise<GenerateSlotsResult> {
  return api.post<GenerateSlotsResult>(`/owner/courts/${courtId}/slots/generate`, range);
}

export interface SlotChange {
  status?: "available" | "maintenance";
  price?: string;
  /** why a slot is being blocked (optional, kept in the audit trail) */
  reason?: string;
}

export function updateSlot(courtId: string, slotId: string, change: SlotChange): Promise<Slot> {
  return api.patch<Slot>(`/owner/courts/${courtId}/slots/${slotId}`, change);
}

export function deleteSlot(courtId: string, slotId: string): Promise<unknown> {
  return api.del(`/owner/courts/${courtId}/slots/${slotId}`);
}
