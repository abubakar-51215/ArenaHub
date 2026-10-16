"use client";

/**
 * Owner Revenue, laid out as the owner prototype's Earnings screen with the
 * data the API has: KPI cards (gross earnings and bookings with their change
 * against the previous period, and the settlements still pending), the daily
 * earnings chart, "Share by arena" (donut and list) and earnings by arena.
 * The arena comes from the top bar picker. Left out, as no payout data
 * exists: platform fee, net payout, in transit and payout history. The CSV
 * and PDF exports stay in the header.
 */
import { Suspense, useMemo, useState } from "react";

import { Donut, LineChart, Sparkline } from "@/components/admin/charts";
import { Delta, OverviewCard, dayLabels, money } from "@/components/admin/overview-parts";
import { AdminAvatar, AdminKpi } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyArenas } from "@/hooks/useArenas";
import { useArenaParam } from "@/hooks/useArenaParam";
import { useDashboardAnalytics, useRevenue } from "@/hooks/useDashboard";
import { formatDateShort, formatRs, plural, toDateInput } from "@/lib/format";
import { downloadOwnerReport, type OwnerReportType } from "@/services/reports";

const SHARE_COLOURS = ["var(--lime)", "var(--ink)", "#5A6B61", "#AAB6AF", "#D9930B"];

function Earnings() {
  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const arenaNames = new Map(arenas.map((a) => [a.id, a.name]));
  const [arenaId] = useArenaParam();
  const picked = arenas.find((a) => a.id === arenaId);

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(
    toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [reportType, setReportType] = useState<OwnerReportType>("bookings");

  const params = { dateFrom, dateTo, arenaId: arenaId || undefined };
  const analytics = useDashboardAnalytics(params);
  const revenue = useRevenue(params);
  const a = analytics.data;
  const dash = analytics.isLoading ? "—" : undefined;

  const trend = a?.revenue_trend ?? [];
  const daily = trend.map((p) => Number(p.amount));
  const best = trend.reduce<{ date: string; amount: number } | null>(
    (top, p) =>
      Number(p.amount) > (top?.amount ?? 0) ? { date: p.date, amount: Number(p.amount) } : top,
    null,
  );

  // arenas with earnings, largest first
  const byArena = (revenue.data?.breakdown_by_arena ?? [])
    .map((r) => ({ id: r.id, name: arenaNames.get(r.id) ?? "Arena", amount: Number(r.amount) }))
    .filter((r) => r.amount > 0)
    .sort((x, y) => y.amount - x.amount);
  const shareTotal = byArena.reduce((n, r) => n + r.amount, 0);
  const pct = (v: number) => (shareTotal ? Math.round((v / shareTotal) * 100) : 0);

  const state = (q: { isLoading: boolean; isError: boolean }, has: boolean) =>
    q.isLoading ? "loading" : q.isError ? "error" : has ? "ready" : "empty";

  const exportAs = (format: "csv" | "pdf") =>
    downloadOwnerReport({
      format,
      type: reportType,
      arenaId: arenaId || undefined,
      dateFrom,
      dateTo,
    });

  return (
    <>
      <PageHeader
        title="Revenue"
        subtitle={`${dateFrom ? formatDateShort(dateFrom) : "Start"} – ${dateTo ? formatDateShort(dateTo) : "today"} · ${picked ? picked.name : "All arenas"}`}
      >
        <div className="ah-daterow">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To"
          />
        </div>
        <Select
          value={reportType}
          onChange={(e) => setReportType(e.target.value as OwnerReportType)}
          aria-label="Report"
        >
          <option value="bookings">Bookings &amp; revenue</option>
          <option value="occupancy">Occupancy &amp; peak usage</option>
        </Select>
        <Button variant="outline" onClick={() => exportAs("csv")}>
          Export CSV
        </Button>
        <Button variant="outline" onClick={() => exportAs("pdf")}>
          Export PDF
        </Button>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {analytics.isError && !a ? (
          <section className="ah-card">
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the figures.</span>
                <button type="button" className="ah-link" onClick={() => void analytics.refetch()}>
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="ah-grid ah-g-3">
            <AdminKpi
              size="lg"
              label="Gross earnings"
              value={dash ?? money(Number(a?.total_revenue ?? 0))}
              foot={
                a ? (
                  <div className="ah-kpi-stack">
                    {a.revenue_change_pct !== null && (
                      <span>
                        <Delta pct={a.revenue_change_pct} /> vs previous period
                      </span>
                    )}
                    <Sparkline values={daily} />
                  </div>
                ) : undefined
              }
            />
            <AdminKpi
              size="lg"
              label="Bookings"
              value={dash ?? (a?.total_bookings ?? 0).toLocaleString("en-US")}
              foot={
                a && a.bookings_change_pct !== null ? (
                  <>
                    <Delta pct={a.bookings_change_pct} /> vs previous period
                  </>
                ) : undefined
              }
            />
            <AdminKpi
              size="lg"
              label="Pending settlements"
              value={revenue.isLoading ? "—" : formatRs(revenue.data?.pending_settlements ?? 0)}
              foot="Balances still to collect at the arena"
            />
          </div>
        )}

        <div className="ah-grid ah-g-32">
          <OverviewCard
            title="Daily earnings"
            state={state(
              analytics,
              daily.some((v) => v > 0),
            )}
            onRetry={() => void analytics.refetch()}
            empty="No earnings in this period."
            actions={
              best ? (
                <span className="ah-tag">
                  Best day: {formatDateShort(best.date)} · {formatRs(best.amount)}
                </span>
              ) : undefined
            }
          >
            <LineChart
              now={daily}
              labels={dayLabels(trend)}
              tip={money(daily[daily.length - 1] ?? 0)}
            />
          </OverviewCard>
          <OverviewCard
            title="Share by arena"
            state={state(revenue, byArena.length > 0)}
            onRetry={() => void revenue.refetch()}
            empty="No earnings in this period."
          >
            <Donut
              total={shareTotal}
              centre={money(shareTotal).replace("Rs. ", "")}
              caption="RUPEES"
              label="Earnings by arena"
              colours={SHARE_COLOURS}
              shares={byArena.map((r) => ({ label: r.name, pct: pct(r.amount) }))}
            />
          </OverviewCard>
        </div>

        <OverviewCard
          title="Earnings by arena"
          state={state(revenue, byArena.length > 0)}
          onRetry={() => void revenue.refetch()}
          empty="No earnings in this period."
          actions={
            byArena.length > 0 ? (
              <span className="ah-tag">{plural(byArena.length, "arena")}</span>
            ) : undefined
          }
        >
          <div className="ah-earn-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arena</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead className="ah-r">Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byArena.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <AdminAvatar name={r.name} />
                        <span className="ah-strong">{r.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="ah-occ">
                        <div className="ah-rank-bar" aria-hidden="true">
                          <i style={{ width: `${pct(r.amount)}%` }} />
                        </div>
                        <span className="tabular-nums">{pct(r.amount)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="ah-r ah-money">{formatRs(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </OverviewCard>
      </div>
    </>
  );
}

export default function EarningsPage() {
  return (
    <Suspense fallback={null}>
      <Earnings />
    </Suspense>
  );
}
