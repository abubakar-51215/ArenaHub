/** Player-facing arena discovery API calls. */
import { api } from "../lib/api";
import type { Arena, ArenaCity, Page, RatingSummary } from "../types";

export interface ArenaSearchParams {
  q?: string;
  city?: ArenaCity;
  sport?: string;
  price_min?: number;
  price_max?: number;
  sort?: "newest" | "name" | "price_asc" | "price_desc" | "rating_desc";
  page?: number;
  page_size?: number;
}

function toQuery(params: object): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export function searchArenas(
  params: ArenaSearchParams = {},
): Promise<Page<Arena>> {
  return api.get<Page<Arena>>(`/arenas${toQuery(params)}`);
}

export function getArena(arenaId: string): Promise<Arena> {
  return api.get<Arena>(`/arenas/${arenaId}`);
}

export function getRatingSummary(arenaId: string): Promise<RatingSummary> {
  return api.get<RatingSummary>(`/arenas/${arenaId}/reviews/summary`);
}

/** Arenas ranked by booking volume in the last `days` days (falls back to a
 * rating-ranked popular list server-side when the window has no bookings). */
export function getTrendingArenas(opts: {
  days?: number;
  city?: ArenaCity;
  limit?: number;
}): Promise<{ items: Arena[] }> {
  return api.get<{ items: Arena[] }>(
    `/arenas/trending${toQuery({ days: opts.days ?? 7, city: opts.city, limit: opts.limit ?? 10 })}`,
  );
}
