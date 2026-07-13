/** Owner court management API calls (backend modules/court). */
import { api } from "@/services/api";
import type { Court } from "@/types";

export interface CourtInput {
  name: string;
  description?: string | null;
  sport_types: string[];
  capacity?: number | null;
  base_price: string;
  images?: string[];
  is_available?: boolean;
}

export function listCourts(arenaId: string): Promise<Court[]> {
  return api.get<Court[]>(`/owner/arenas/${arenaId}/courts`);
}

export function createCourt(arenaId: string, input: CourtInput): Promise<Court> {
  return api.post<Court>(`/owner/arenas/${arenaId}/courts`, input);
}

export function updateCourt(courtId: string, input: Partial<CourtInput>): Promise<Court> {
  return api.patch<Court>(`/owner/courts/${courtId}`, input);
}

export function setCourtAvailability(courtId: string, isAvailable: boolean): Promise<Court> {
  return api.patch<Court>(`/owner/courts/${courtId}/availability`, { is_available: isAvailable });
}

export function deleteCourt(courtId: string): Promise<null> {
  return api.del<null>(`/owner/courts/${courtId}`);
}
