/** Owner blocked-dates management API calls (backend modules/arena blocked dates). */
import { api } from "@/services/api";
import type { BlockedDate } from "@/types";

export function listBlockedDates(arenaId: string): Promise<BlockedDate[]> {
  return api.get<BlockedDate[]>(`/owner/arenas/${arenaId}/blocked-dates`);
}

export function blockDate(
  arenaId: string,
  blockedDate: string,
  reason?: string,
): Promise<BlockedDate> {
  return api.post<BlockedDate>(`/owner/arenas/${arenaId}/blocked-dates`, {
    blocked_date: blockedDate,
    reason: reason || undefined,
  });
}

export function unblockDate(arenaId: string, blockedId: string): Promise<null> {
  return api.del<null>(`/owner/arenas/${arenaId}/blocked-dates/${blockedId}`);
}
