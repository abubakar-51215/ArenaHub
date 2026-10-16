/** Admin Dashboard overview (GET /admin/dashboard/overview): read-only. */
import { api } from "@/services/api";

export type OverviewRange = "30d" | "quarter";

export interface OverviewKpi {
  value: number;
  /** % change against the previous period; null when there is nothing to compare */
  delta_pct: number | null;
  /** one point per day of the current period */
  series: number[];
  /** the card's second figure (new sign-ups, bookings today, arenas pending) */
  extra: number | null;
}

export interface DashboardOverview {
  period: {
    start: string;
    end: string;
    previous_start: string;
    previous_end: string;
    range: OverviewRange;
  };
  city: string | null;
  kpis: {
    players: OverviewKpi;
    bookings: OverviewKpi;
    gross_value: OverviewKpi;
    live_arenas: OverviewKpi;
  };
  bookings_by_day: { date: string; value: number }[];
  previous_bookings_by_day: { date: string; value: number }[];
  by_city: { city: string; bookings: number; share_pct: number }[];
  utilisation_by_hour: { hour: number; used: number; total: number; pct: number }[];
  peak_window: { start_hour: number; end_hour: number } | null;
  top_arenas: { arena_id: string; name: string; city: string; bookings: number; value: number }[];
  queue: { pending_arenas: number; open_complaints: number; oldest_waiting_at: string | null };
}

export function fetchDashboardOverview(params: {
  city?: string;
  range: OverviewRange;
}): Promise<DashboardOverview> {
  const q = new URLSearchParams({ range: params.range });
  if (params.city) q.set("city", params.city);
  return api.get<DashboardOverview>(`/admin/dashboard/overview?${q.toString()}`);
}
