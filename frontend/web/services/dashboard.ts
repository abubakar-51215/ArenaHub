/** Owner dashboard API calls (backend modules/dashboard + payment approval). */
import { api } from "@/services/api";
import type {
  BookingStatus,
  CalendarBooking,
  DashboardAnalytics,
  DashboardSummary,
  OwnerBookingRow,
  Page,
  PendingApproval,
  RevenueSummary,
} from "@/types";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return api.get<DashboardSummary>("/owner/dashboard/summary");
}

export interface AnalyticsParams {
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  arenaId?: string;
}

export function getDashboardAnalytics(params: AnalyticsParams = {}): Promise<DashboardAnalytics> {
  const q = new URLSearchParams();
  if (params.dateFrom) q.set("date_from", params.dateFrom);
  if (params.dateTo) q.set("date_to", params.dateTo);
  if (params.city) q.set("city", params.city);
  if (params.arenaId) q.set("arena_id", params.arenaId);
  const qs = q.toString();
  return api.get<DashboardAnalytics>(`/owner/dashboard/analytics${qs ? `?${qs}` : ""}`);
}

export interface OwnerBookingsParams {
  arenaId?: string;
  courtId?: string;
  status?: BookingStatus;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export function listOwnerBookings(
  params: OwnerBookingsParams = {},
): Promise<Page<OwnerBookingRow>> {
  const q = new URLSearchParams();
  if (params.arenaId) q.set("arena_id", params.arenaId);
  if (params.courtId) q.set("court_id", params.courtId);
  if (params.status) q.set("status", params.status);
  if (params.dateFrom) q.set("date_from", params.dateFrom);
  if (params.dateTo) q.set("date_to", params.dateTo);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.pageSize ?? 20));
  return api.get<Page<OwnerBookingRow>>(`/owner/dashboard/bookings?${q.toString()}`);
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
