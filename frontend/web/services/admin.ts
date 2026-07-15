/** Admin panel API calls: verification, user management, platform-wide
 * monitoring, dashboard metrics, and the audit log. */
import { api } from "@/services/api";
import type {
  AdminBooking,
  AdminPayment,
  AdminUser,
  AdminUserDetail,
  Arena,
  ArenaStatus,
  AuditLogEntry,
  BookingStatus,
  DashboardMetrics,
  Page,
  PaymentMethod,
  PaymentStatus,
  PlatformSettings,
  UserRole,
} from "@/types";

export function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  return api.get<DashboardMetrics>("/admin/dashboard");
}

// ---- arena verification ----

export function listArenaQueue(status: ArenaStatus, page = 1, pageSize = 20): Promise<Page<Arena>> {
  return api.get<Page<Arena>>(`/admin/arenas?status=${status}&page=${page}&page_size=${pageSize}`);
}

export function approveArena(arenaId: string): Promise<Arena> {
  return api.post<Arena>(`/admin/arenas/${arenaId}/approve`);
}

export function rejectArena(arenaId: string, reason: string): Promise<Arena> {
  return api.post<Arena>(`/admin/arenas/${arenaId}/reject`, { reason });
}

// ---- user management ----

export function listUsers(params: {
  role?: UserRole;
  is_active?: boolean;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<AdminUser>> {
  const q = new URLSearchParams();
  if (params.role) q.set("role", params.role);
  if (params.is_active !== undefined) q.set("is_active", String(params.is_active));
  if (params.search) q.set("search", params.search);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  return api.get<Page<AdminUser>>(`/admin/users?${q.toString()}`);
}

export function getUserDetail(userId: string): Promise<AdminUserDetail> {
  return api.get<AdminUserDetail>(`/admin/users/${userId}`);
}

export function suspendUser(userId: string, reason: string): Promise<AdminUser> {
  return api.patch<AdminUser>(`/admin/users/${userId}/suspend`, { reason });
}

export function reactivateUser(userId: string): Promise<AdminUser> {
  return api.patch<AdminUser>(`/admin/users/${userId}/reactivate`);
}

// ---- platform-wide monitoring ----

export function listAllBookings(params: {
  status?: BookingStatus;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<Page<AdminBooking>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.date_from) q.set("date_from", params.date_from);
  if (params.date_to) q.set("date_to", params.date_to);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  return api.get<Page<AdminBooking>>(`/admin/bookings?${q.toString()}`);
}

export function listAllPayments(params: {
  status?: PaymentStatus;
  method?: PaymentMethod;
  page?: number;
  page_size?: number;
}): Promise<Page<AdminPayment>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.method) q.set("method", params.method);
  q.set("page", String(params.page ?? 1));
  q.set("page_size", String(params.page_size ?? 20));
  return api.get(`/admin/payments?${q.toString()}`);
}

// ---- audit log ----

export function listAuditLogs(page = 1, pageSize = 20): Promise<Page<AuditLogEntry>> {
  return api.get<Page<AuditLogEntry>>(`/admin/audit-logs?page=${page}&page_size=${pageSize}`);
}

// ---- platform settings ----

export function fetchPlatformSettings(): Promise<PlatformSettings> {
  return api.get<PlatformSettings>("/admin/settings");
}

export function updatePlatformSettings(data: PlatformSettings): Promise<PlatformSettings> {
  return api.put<PlatformSettings>("/admin/settings", data);
}
