/** Owner dashboard API calls (backend modules/dashboard + payment approval). */
import { api } from "@/services/api";
import type {
  CalendarBooking,
  DashboardSummary,
  Page,
  PendingApproval,
  RevenueSummary,
} from "@/types";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return api.get<DashboardSummary>("/owner/dashboard/summary");
}

export function listPendingApprovals(page = 1, pageSize = 20): Promise<Page<PendingApproval>> {
  return api.get<Page<PendingApproval>>(
    `/owner/dashboard/pending-approvals?page=${page}&page_size=${pageSize}`,
  );
}

export function getCalendar(arenaId: string, from: string, to: string): Promise<CalendarBooking[]> {
  return api.get<CalendarBooking[]>(
    `/owner/arenas/${arenaId}/bookings/calendar?from=${from}&to=${to}`,
  );
}

export interface RevenueParams {
  dateFrom?: string;
  dateTo?: string;
  arenaId?: string;
}

export function getRevenue(params: RevenueParams = {}): Promise<RevenueSummary> {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("date_from", params.dateFrom);
  if (params.dateTo) q.set("date_to", params.dateTo);
  if (params.arenaId) q.set("arena_id", params.arenaId);
  const qs = q.toString();
  return api.get<RevenueSummary>(`/owner/dashboard/revenue${qs ? `?${qs}` : ""}`);
}

export function approvePayment(paymentId: string): Promise<unknown> {
  return api.post(`/owner/payments/${paymentId}/approve`);
}

export function rejectPayment(paymentId: string, reason: string): Promise<unknown> {
  return api.post(`/owner/payments/${paymentId}/reject`, { reason });
}
