"use client";

import { useMemo, useState } from "react";

import { Clock, Percent, TrendingUp, Wallet } from "lucide-react";

import { BookingsByTimeChart, RevenueTrendChart } from "@/components/owner/charts";
import { PageHeader } from "@/components/owner/page-header";
import { StatusBadge } from "@/components/owner/status-badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { useDashboardAnalytics } from "@/hooks/useDashboard";
import { formatDateShort, formatHour, formatRs, formatTime, toDateInput } from "@/lib/format";
import { ARENA_CITIES } from "@/types";

export default function DashboardPage() {
  const today = useMemo(() => new Date(), []);
  const weekAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d;
  }, [today]);

  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState(toDateInput(weekAgo));
  const [dateTo, setDateTo] = useState(toDateInput(today));

  const { data, isLoading } = useDashboardAnalytics({
    dateFrom,
    dateTo,
    city: city || undefined,
  });

  const trend = (data?.revenue_trend ?? []).map((p) => ({
    label: formatDateShort(p.date),
    amount: Number(p.amount),
  }));
  // The wireframe's time axis runs 6 AM – 12 AM (the bookable day).
  const byTime = (data?.bookings_by_time ?? []).filter((p) => p.hour >= 6);

  return (
    <>
      <PageHeader title="Dashboard">
        <Select value={city} onChange={(e) => setCity(e.target.value)} className="w-36">
          <option value="">All Cities</option>
          {ARENA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-38"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-38"
        />
      </PageHeader>

      <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Revenue"
            value={isLoading ? "—" : formatRs(data?.total_revenue ?? 0)}
            delta={data?.revenue_change_pct}
            icon={Wallet}
            tone="green"
          />
          <StatCard
            label="Total Bookings"
            value={isLoading ? "—" : String(data?.total_bookings ?? 0)}
            delta={data?.bookings_change_pct}
            icon={TrendingUp}
            tone="blue"
          />
          <StatCard
            label="Peak Hours"
            value={
              isLoading
                ? "—"
                : data?.peak_hours
                  ? `${formatHour(data.peak_hours.start_hour)} – ${formatHour(data.peak_hours.end_hour)}`
                  : "—"
            }
            subtitle="Most booked window"
            icon={Clock}
            tone="amber"
          />
          <StatCard
            label="Occupancy Rate"
            value={isLoading ? "—" : data?.occupancy_rate != null ? `${data.occupancy_rate}%` : "—"}
            delta={data?.occupancy_change_pts}
            icon={Percent}
            tone="violet"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="shadow-card rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-semibold text-foreground">Revenue Overview</h3>
            <RevenueTrendChart data={trend} />
          </div>
          <div className="shadow-card rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-semibold text-foreground">Bookings by Time of Day</h3>
            <BookingsByTimeChart data={byTime} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="shadow-card rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">Top Arenas</h3>
            </div>
            <div className="divide-y divide-border">
              {(data?.top_arenas ?? []).length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  No revenue in this range yet.
                </p>
              )}
              {(data?.top_arenas ?? []).map((a) => (
                <div key={a.arena_id} className="flex items-center justify-between px-5 py-3">
                  <p className="font-medium text-foreground">{a.name}</p>
                  <p className="text-sm text-muted-foreground">{formatRs(a.revenue)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="shadow-card rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="font-semibold text-foreground">Recent Bookings</h3>
            </div>
            <div className="divide-y divide-border">
              {(data?.recent_bookings ?? []).length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground">No bookings yet.</p>
              )}
              {(data?.recent_bookings ?? []).map((b) => (
                <div key={b.booking_id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {formatDateShort(b.booking_date)}, {formatTime(b.start_time)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.court_name} – {b.arena_name}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
