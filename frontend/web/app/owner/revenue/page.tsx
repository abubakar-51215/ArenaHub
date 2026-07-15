"use client";

import { useMemo, useState } from "react";

import { EarningsByArenaDonut, RevenueTrendChart } from "@/components/owner/charts";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { useDashboardAnalytics, useRevenue } from "@/hooks/useDashboard";
import { formatDateShort, formatRs, toDateInput } from "@/lib/format";
import { downloadOwnerReport, type OwnerReportType } from "@/services/reports";

function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {delta != null && (
        <p className={`mt-1 text-xs ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
          {delta >= 0 ? "+" : ""}
          {delta}% vs last period
        </p>
      )}
    </div>
  );
}

export default function EarningsPage() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const arenaNames = useMemo(() => new Map(arenas.map((a) => [a.id, a.name])), [arenas]);

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);

  const [arenaId, setArenaId] = useState("");
  const [dateFrom, setDateFrom] = useState(toDateInput(monthStart));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [reportType, setReportType] = useState<OwnerReportType>("bookings");

  const { data: analytics, isLoading } = useDashboardAnalytics({
    dateFrom,
    dateTo,
    arenaId: arenaId || undefined,
  });
  const { data: revenue } = useRevenue({
    arenaId: arenaId || undefined,
    dateFrom,
    dateTo,
  });

  const totalEarnings = Number(analytics?.total_revenue ?? 0);
  const pendingPayout = Number(revenue?.pending_settlements ?? 0);
  // No commission model exists yet, so the payout figures derive directly:
  // net = earnings minus the advance balances still uncollected on-site.
  const netPayout = Math.max(totalEarnings - pendingPayout, 0);

  const trend = (analytics?.revenue_trend ?? []).map((p) => ({
    label: formatDateShort(p.date),
    amount: Number(p.amount),
  }));

  const donutData = (revenue?.breakdown_by_arena ?? [])
    .map((row) => ({
      name: arenaNames.get(row.id) ?? row.id.slice(0, 8),
      value: Number(row.amount),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <>
      <PageHeader title="Earnings Overview">
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
        <Select value={arenaId} onChange={(e) => setArenaId(e.target.value)} className="w-44">
          <option value="">All Arenas</option>
          {arenas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as OwnerReportType)}
          className="w-44"
        >
          <option value="bookings">Bookings &amp; Revenue</option>
          <option value="occupancy">Occupancy &amp; Peak Usage</option>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadOwnerReport({
              format: "csv",
              type: reportType,
              arenaId: arenaId || undefined,
              dateFrom,
              dateTo,
            })
          }
        >
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadOwnerReport({
              format: "pdf",
              type: reportType,
              arenaId: arenaId || undefined,
              dateFrom,
              dateTo,
            })
          }
        >
          Export PDF
        </Button>
      </PageHeader>

      <div className="space-y-6 p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Earnings"
            value={isLoading ? "—" : formatRs(totalEarnings)}
            delta={analytics?.revenue_change_pct}
          />
          <StatCard label="Net Payout" value={isLoading ? "—" : formatRs(netPayout)} />
          <StatCard label="Total Payouts" value={isLoading ? "—" : formatRs(netPayout)} />
          <StatCard label="Pending Payout" value={isLoading ? "—" : formatRs(pendingPayout)} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-semibold text-foreground">Earnings Trend</h3>
            <RevenueTrendChart data={trend} />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="mb-4 font-semibold text-foreground">Earnings by Arena</h3>
            {donutData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No earnings in this range yet.
              </p>
            ) : (
              <EarningsByArenaDonut data={donutData} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
