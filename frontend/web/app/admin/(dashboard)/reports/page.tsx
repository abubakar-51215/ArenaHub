"use client";

import { useState } from "react";

import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useDashboardMetrics } from "@/hooks/useAdmin";
import { formatRs } from "@/lib/format";
import { downloadAdminReport, type AdminReportType } from "@/services/reports";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

const REPORT_TYPES: { value: AdminReportType; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "bookings", label: "Bookings" },
  { value: "revenue", label: "Revenue" },
  { value: "arenas", label: "Arenas" },
  { value: "system", label: "System (peak hours & popular sports)" },
];

export default function AdminReportsPage() {
  const { data, isLoading } = useDashboardMetrics();
  const [type, setType] = useState<AdminReportType>("bookings");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function handleDownload(format: "csv" | "pdf") {
    setDownloading(true);
    try {
      await downloadAdminReport({
        type,
        format,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PageHeader title="Reports &amp; Analytics" />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Bookings"
            value={isLoading ? "—" : String(data?.bookings_all_time ?? 0)}
          />
          <StatCard
            label="Total Revenue"
            value={isLoading ? "—" : formatRs(data?.total_revenue ?? 0)}
          />
          <StatCard
            label="Active Users"
            value={isLoading ? "—" : String((data?.total_players ?? 0) + (data?.total_owners ?? 0))}
          />
          <StatCard
            label="Total Arenas"
            value={isLoading ? "—" : String(data?.total_arenas ?? 0)}
          />
        </div>

        <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
          <h3 className="font-semibold text-foreground">Downloadable reports</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Export a platform-wide report as CSV or PDF. Date range applies to bookings and revenue
            only — users, arenas, and the system summary always cover the full current data.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="report-type">Report</Label>
              <Select
                id="report-type"
                value={type}
                onChange={(e) => setType(e.target.value as AdminReportType)}
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" disabled={downloading} onClick={() => handleDownload("csv")}>
              Export CSV
            </Button>
            <Button variant="outline" disabled={downloading} onClick={() => handleDownload("pdf")}>
              Export PDF
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
