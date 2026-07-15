/** Report export downloads (CSV/PDF) — owner + admin. */
import { downloadFile } from "@/services/api";

export type ReportFormat = "csv" | "pdf";
export type AdminReportType = "users" | "bookings" | "revenue" | "arenas";

export interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

export function downloadOwnerReport(
  params: { format: ReportFormat; arenaId?: string } & DateRange,
): Promise<void> {
  const qs = new URLSearchParams({ format: params.format });
  if (params.arenaId) qs.set("arena_id", params.arenaId);
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  return downloadFile(`/owner/reports?${qs}`, `owner-report.${params.format}`);
}

export function downloadAdminReport(
  params: { type: AdminReportType; format: ReportFormat } & DateRange,
): Promise<void> {
  const qs = new URLSearchParams({ type: params.type, format: params.format });
  if (params.dateFrom) qs.set("date_from", params.dateFrom);
  if (params.dateTo) qs.set("date_to", params.dateTo);
  return downloadFile(`/admin/reports?${qs}`, `admin-${params.type}-report.${params.format}`);
}
