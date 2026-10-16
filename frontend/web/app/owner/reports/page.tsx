"use client";

/**
 * Owner Reports, styled as the owner prototype's Reports screen. The
 * downloads work as before (period, arena, CSV and PDF for each report);
 * the arena now comes from the top bar picker. Two of the prototype's
 * visuals are built from existing endpoints: "Hours sold by arena" (summed
 * from each arena's calendar bookings, cancelled and rejected left out) and
 * the arena comparison (bookings and hours from the calendar, cancelled
 * and rejected left out; revenue and occupancy from the analytics for each
 * arena; average rate = revenue / hours).
 * Left out: "Occupancy by weekday" (no endpoint gives occupancy per
 * weekday), "Schedule weekly" and the repeat rate.
 */
import { Suspense, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import { RankList } from "@/components/admin/charts";
import { OverviewCard } from "@/components/admin/overview-parts";
import { AdminAvatar } from "@/components/admin/ui";
import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatDateShort, formatRs, plural, toDateInput } from "@/lib/format";
import { ApiError } from "@/services/api";
import { getCalendar, getDashboardAnalytics } from "@/services/dashboard";
import { downloadOwnerReport, type OwnerReportType, type ReportFormat } from "@/services/reports";

const REPORTS: { type: OwnerReportType; title: string; description: string }[] = [
  {
    type: "bookings",
    title: "Bookings & revenue",
    description: "Every booking in the period with its court, customer, status and amount.",
  },
  {
    type: "occupancy",
    title: "Occupancy & peak usage",
    description: "How full each court was, and which hours are busiest.",
  },
];

const OFF = new Set(["cancelled", "rejected"]);

function minutes(hms: string): number {
  const [h, m] = hms.split(":").map(Number);
  return h * 60 + m;
}
function hoursText(h: number): string {
  const n = Math.round(h * 10) / 10;
  return `${n.toLocaleString("en-US")} ${n === 1 ? "hr" : "hrs"}`;
}

type Status = { kind: "idle" } | { kind: "busy"; key: string } | { kind: "error"; message: string };

function Reports() {
  const { data: arenaPage, isLoading: arenasLoading, isError: arenasError } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  const [arenaId] = useArenaParam();
  const picked = arenas.find((a) => a.id === arenaId);
  const scope = picked ? [picked] : arenas;

  const today = useMemo(() => new Date(), []);
  const [dateFrom, setDateFrom] = useState(
    toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const rangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const noArenas = !arenasLoading && !arenasError && arenas.length === 0;
  const ready = !rangeInvalid && !!dateFrom && !!dateTo;

  async function download(type: OwnerReportType, format: ReportFormat) {
    setStatus({ kind: "busy", key: `${type}-${format}` });
    try {
      await downloadOwnerReport({ type, format, arenaId: arenaId || undefined, dateFrom, dateTo });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Could not download the report.",
      });
    }
  }

  // per arena: analytics (bookings, revenue, occupancy) and calendar (hours)
  const analyticsQueries = useQueries({
    queries: scope.map((a) => ({
      queryKey: ["dashboard-analytics", dateFrom, dateTo, "", a.id],
      queryFn: () => getDashboardAnalytics({ dateFrom, dateTo, arenaId: a.id }),
      enabled: ready,
    })),
  });
  const calendarQueries = useQueries({
    queries: scope.map((a) => ({
      queryKey: ["calendar", a.id, dateFrom, dateTo],
      queryFn: () => getCalendar(a.id, dateFrom, dateTo),
      enabled: ready,
    })),
  });
  const loading =
    arenasLoading || [...analyticsQueries, ...calendarQueries].some((q) => q.isLoading);
  const failed = [...analyticsQueries, ...calendarQueries].some((q) => q.isError);
  const retry = () => [...analyticsQueries, ...calendarQueries].forEach((q) => void q.refetch());

  const rows = scope.map((a, i) => {
    const an = analyticsQueries[i]?.data;
    // bookings and hours from the same calendar rows, so they agree
    const held = (calendarQueries[i]?.data ?? []).filter((b) => !OFF.has(b.status));
    const hours = held.reduce(
      (n, b) => n + ((minutes(b.end_time) || 24 * 60) - minutes(b.start_time)) / 60,
      0,
    );
    const revenue = Number(an?.total_revenue ?? 0);
    return {
      id: a.id,
      name: a.name,
      bookings: held.length,
      hours,
      revenue,
      rate: hours > 0 ? revenue / hours : null,
      occupancy: an?.occupancy_rate ?? null,
    };
  });
  const totalHours = rows.reduce((n, r) => n + r.hours, 0);
  const ranked = [...rows].filter((r) => r.hours > 0).sort((x, y) => y.hours - x.hours);
  const state = loading ? "loading" : failed ? "error" : "ready";
  const period = `${dateFrom ? formatDateShort(dateFrom) : ""} – ${dateTo ? formatDateShort(dateTo) : ""}`;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`Compare arenas across the same period · ${picked ? picked.name : "All arenas"}`}
      >
        <div className="ah-daterow">
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From"
          />
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To"
          />
        </div>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        {rangeInvalid && (
          <div className="ah-card-error" role="alert">
            <span>The start date must be on or before the end date.</span>
          </div>
        )}
        {status.kind === "error" && (
          <div className="ah-card-error" role="alert">
            <span>{status.message}</span>
          </div>
        )}

        <div className="ah-grid ah-g-2">
          <section className="ah-card">
            <div className="ah-card-head">
              <h2 className="ah-h2">Downloads</h2>
              <span className="ah-tag">{period}</span>
            </div>
            <div className="ah-card-body">
              <ul className="ah-attn ah-reports">
                {REPORTS.map(({ type, title, description }) => (
                  <li key={type}>
                    <div className="min-w-0">
                      <b>{title}</b>
                      <span>{description}</span>
                    </div>
                    <div className="ah-row-actions">
                      {(["csv", "pdf"] as const).map((format) => {
                        const busy = status.kind === "busy" && status.key === `${type}-${format}`;
                        return (
                          <Button
                            key={format}
                            variant={format === "pdf" ? "default" : "outline"}
                            size="sm"
                            aria-busy={busy}
                            disabled={rangeInvalid || status.kind === "busy" || noArenas}
                            onClick={() => download(type, format)}
                          >
                            {busy ? "Preparing…" : format.toUpperCase()}
                          </Button>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {arenasError && (
              <p className="ah-empty-line ah-pitch-note" role="alert">
                Could not load your arenas. You can still download a report for all arenas.
              </p>
            )}
            {noArenas && (
              <p className="ah-empty-line ah-pitch-note">
                You have no arenas yet, so a report would be empty.
              </p>
            )}
          </section>

          <OverviewCard
            title="Hours sold by arena"
            state={state === "ready" && ranked.length === 0 ? "empty" : state}
            onRetry={retry}
            empty="No hours sold in this period."
            actions={<span className="ah-tag">{hoursText(totalHours)} total</span>}
          >
            <RankList
              items={ranked.map((r) => ({
                key: r.id,
                name: r.name,
                sub: plural(r.bookings, "booking"),
                value: hoursText(r.hours),
                amount: r.hours,
              }))}
            />
          </OverviewCard>
        </div>

        <OverviewCard
          title="Arena comparison"
          state={state === "ready" && rows.length === 0 ? "empty" : state}
          onRetry={retry}
          empty="No arenas to compare yet."
          actions={<span className="ah-tag">{period}</span>}
        >
          <div className="ah-earn-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arena</TableHead>
                  <TableHead className="ah-r">Bookings</TableHead>
                  <TableHead className="ah-r">Hours sold</TableHead>
                  <TableHead className="ah-r">Revenue</TableHead>
                  <TableHead className="ah-r">Avg. rate</TableHead>
                  <TableHead className="ah-r">Occupancy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <AdminAvatar name={r.name} />
                        <span className="ah-strong">{r.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="ah-r tabular-nums">
                      {r.bookings.toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="ah-r tabular-nums">{hoursText(r.hours)}</TableCell>
                    <TableCell className="ah-r ah-money">{formatRs(r.revenue)}</TableCell>
                    <TableCell className="ah-r ah-money">
                      {r.rate != null ? `${formatRs(Math.round(r.rate))} / hr` : "—"}
                    </TableCell>
                    <TableCell className="ah-r tabular-nums">
                      {r.occupancy != null ? `${r.occupancy}%` : "—"}
                    </TableCell>
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

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <Reports />
    </Suspense>
  );
}
