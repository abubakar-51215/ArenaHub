"use client";

/**
 * The owner's Live Board, laid out as the owner prototype's dashboard
 * ("Tonight's board"): the court occupancy grid, a KPI strip, the revenue
 * trend and "When people play", "Arenas by revenue" and "Needs your
 * attention". Everything comes from the existing owner endpoints and follows
 * the top bar's arena picker (analytics take arena_id). Left out, as there
 * is no data for them: the "Unpaid balance" KPI (Peak hours stays in its
 * place), an occupancy target, and booking from an open slot.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";

import { LineChart, HourBars, RankList, Sparkline } from "@/components/admin/charts";
import { Delta, OverviewCard, dayLabels, hourLabel, hourRange, money } from "@/components/admin/overview-parts";
import { AdminBadge, AdminKpi } from "@/components/admin/ui";
import { LiveBoard } from "@/components/owner/live-board";
import { PageHeader } from "@/components/owner/page-header";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useDashboardAnalytics, usePendingApprovals } from "@/hooks/useDashboard";
import { useArenaParam } from "@/hooks/useArenaParam";
import { formatDateShort, formatRs, formatTime, plural, toDateInput } from "@/lib/format";
import { ARENA_CITIES } from "@/types";

function todayLine(): string {
  return new Date()
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .replace(",", "");
}

function Board() {
  const today = useMemo(() => new Date(), []);
  const weekAgo = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 6);
    return d;
  }, [today]);

  const [city, setCity] = useState("");
  const [dateFrom, setDateFrom] = useState(toDateInput(weekAgo));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [arenaId] = useArenaParam();

  const { data, isLoading, isError, refetch } = useDashboardAnalytics({
    dateFrom,
    dateTo,
    city: city || undefined,
    arenaId: arenaId || undefined,
  });
  const approvals = usePendingApprovals(1, 5);

  const state = (hasData: boolean) =>
    isLoading ? "loading" : isError ? "error" : hasData ? "ready" : "empty";
  const retry = () => void refetch();
  const dash = isLoading ? "—" : undefined;

  const trend = data?.revenue_trend ?? [];
  const revenue = trend.map((p) => Number(p.amount));
  // the prototype's chart runs over the bookable day, 6 AM onwards
  const byHour = (data?.bookings_by_time ?? []).filter((p) => p.hour >= 6);
  const peakIdx = byHour.some((h) => h.count > 0)
    ? byHour.reduce((best, h, i) => (h.count > byHour[best].count ? i : best), 0)
    : -1;
  const pending = approvals.data?.items ?? [];

  return (
    <>
      <PageHeader title="Live Board" eyebrow={todayLine()}>
        <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
          <option value="">All cities</option>
          {ARENA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <div className="ah-daterow">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="From" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="To" />
        </div>
      </PageHeader>

      <div className="ah-ocanvas animate-fade-in ah-stack">
        <LiveBoard />

        {isError && !data ? (
          <section className="ah-card">
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the figures.</span>
                <button type="button" className="ah-link" onClick={retry}>
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="stagger ah-grid ah-g-4">
            <AdminKpi
              label="Revenue"
              value={dash ?? formatRs(data?.total_revenue ?? 0)}
              foot={
                data ? (
                  <div className="ah-kpi-stack">
                    {data.revenue_change_pct !== null && (
                      <span>
                        <Delta pct={data.revenue_change_pct} /> vs previous period
                      </span>
                    )}
                    <Sparkline values={revenue} />
                  </div>
                ) : undefined
              }
            />
            <AdminKpi
              label="Bookings"
              value={dash ?? (data?.total_bookings ?? 0).toLocaleString("en-US")}
              foot={
                data && data.bookings_change_pct !== null ? (
                  <>
                    <Delta pct={data.bookings_change_pct} /> vs previous period
                  </>
                ) : undefined
              }
            />
            <AdminKpi
              label="Occupancy rate"
              value={dash ?? (data?.occupancy_rate != null ? `${data.occupancy_rate}%` : "—")}
              foot={
                data && data.occupancy_change_pts != null ? (
                  <>
                    <span className={`ah-delta ${data.occupancy_change_pts >= 0 ? "up" : "down"}`}>
                      {data.occupancy_change_pts >= 0 ? "▲" : "▼"} {Math.abs(data.occupancy_change_pts)} pts
                    </span>{" "}
                    vs previous period
                  </>
                ) : undefined
              }
            />
            <AdminKpi
              label="Peak hours"
              value={
                dash ??
                (data?.peak_hours ? hourRange(data.peak_hours.start_hour, data.peak_hours.end_hour) : "—")
              }
              foot={data?.peak_hours ? "Most booked window" : undefined}
            />
          </div>
        )}

        <div className="ah-grid ah-g-32">
          <OverviewCard
            title="Revenue trend"
            state={state(revenue.some((v) => v > 0))}
            onRetry={retry}
            empty="No revenue in this period."
          >
            <LineChart now={revenue} labels={dayLabels(trend)} tip={money(revenue[revenue.length - 1] ?? 0)} />
          </OverviewCard>
          <OverviewCard
            title="When people play"
            state={state(byHour.some((h) => h.count > 0))}
            onRetry={retry}
            empty="No bookings in this period."
            actions={
              data?.peak_hours ? (
                <span className="ah-tag">
                  Peak {hourRange(data.peak_hours.start_hour, data.peak_hours.end_hour)}
                </span>
              ) : undefined
            }
          >
            <HourBars
              peakIdx={peakIdx}
              data={byHour.map((h) => ({
                label: hourLabel(h.hour),
                value: h.count,
                title: `${hourLabel(h.hour)}: ${plural(h.count, "booking")}`,
              }))}
            />
          </OverviewCard>
        </div>

        <div className="ah-grid ah-g-32">
          <OverviewCard
            title="Arenas by revenue"
            state={state((data?.top_arenas ?? []).length > 0)}
            onRetry={retry}
            empty="No revenue in this period."
          >
            <RankList
              items={(data?.top_arenas ?? []).map((a) => ({
                key: a.arena_id,
                name: a.name,
                sub: "",
                value: formatRs(a.revenue),
                amount: Number(a.revenue),
              }))}
            />
          </OverviewCard>
          <OverviewCard
            title="Needs your attention"
            state={
              approvals.isLoading ? "loading" : approvals.isError ? "error" : pending.length ? "ready" : "empty"
            }
            onRetry={() => void approvals.refetch()}
            empty="Nothing is waiting for you."
            actions={
              <Link href="/owner/bookings" className="ah-link" style={{ marginLeft: "auto", fontSize: 13 }}>
                Bookings
              </Link>
            }
          >
            <ul className="ah-attn">
              {pending.map((p) => (
                <li key={p.booking_id}>
                  <div className="min-w-0">
                    <b className="truncate">{p.player_name}</b>
                    <span>
                      {formatDateShort(p.booking_date)} · {formatTime(p.start_time)} · {p.arena_name}
                    </span>
                  </div>
                  <AdminBadge tone="wait">Receipt to review</AdminBadge>
                </li>
              ))}
            </ul>
          </OverviewCard>
        </div>

        <OverviewCard
          title="Recent bookings"
          state={state((data?.recent_bookings ?? []).length > 0)}
          onRetry={retry}
          empty="No bookings yet."
        >
          <ul className="ah-attn">
            {(data?.recent_bookings ?? []).map((b) => (
              <li key={b.booking_id}>
                <div className="min-w-0">
                  <b>
                    {formatDateShort(b.booking_date)}, {formatTime(b.start_time)}
                  </b>
                  <span>
                    {b.court_name} · {b.arena_name}
                  </span>
                </div>
                <AdminBadge status={b.status} />
              </li>
            ))}
          </ul>
        </OverviewCard>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}
