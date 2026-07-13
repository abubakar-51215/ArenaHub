/** Owner arena management API calls (backend modules/arena). */
import { api } from "@/services/api";
import type { Arena, OperatingHours, Page, RefundTier } from "@/types";

export interface ArenaInput {
  name: string;
  description?: string | null;
  address: string;
  city: string;
  area?: string | null;
  latitude: string;
  longitude: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  operating_hours: OperatingHours;
  sports_offered: string[];
  images?: string[];
  amenity_ids?: string[];
  advance_percentage: number;
  require_full_payment: boolean;
  refund_policy?: RefundTier[];
}

export function listMyArenas(page = 1, pageSize = 50): Promise<Page<Arena>> {
  return api.get<Page<Arena>>(`/owner/arenas?page=${page}&page_size=${pageSize}`);
}

export function getMyArena(id: string): Promise<Arena> {
  return api.get<Arena>(`/owner/arenas/${id}`);
}

export function createArena(input: ArenaInput): Promise<Arena> {
  return api.post<Arena>("/owner/arenas", input);
}

export function updateArena(id: string, input: Partial<ArenaInput>): Promise<Arena> {
  return api.patch<Arena>(`/owner/arenas/${id}`, input);
}

export function deactivateArena(id: string): Promise<null> {
  return api.del<null>(`/owner/arenas/${id}`);
}

export function resubmitArena(id: string): Promise<Arena> {
  return api.post<Arena>(`/owner/arenas/${id}/resubmit`);
}
