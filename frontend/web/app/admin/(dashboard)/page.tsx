"use client";

import { useState } from "react";
import Link from "next/link";

import { Donut, HourBars, LineChart, RankList, Sparkline } from "@/components/admin/charts";
import {
  Delta,
  OverviewCard,
  RANGE_LABEL,
  dayLabels,
  hourLabel,
  hourRange,
  money,
} from "@/components/admin/overview-parts";
import { PageHeader } from "@/components/admin/page-header";
import { AdminBadge } from "@/components/admin/ui";
import { TextInputDialog } from "@/components/owner/text-input-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useArenaQueue, useArenaVerification, useComplaints } from "@/hooks/useAdmin";
import { useDashboardOverview } from "@/hooks/useAdminOverview";
import { formatRs, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api";
import type { DashboardOverview, OverviewKpi, OverviewRange } from "@/services/admin-overview";
import { ARENA_CITIES, type Arena } from "@/types";

function todayLine(city: string): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${weekday}, ${date} · ${city || "all cities"}`;
}

function daysAgo(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function Kpi({
  label,
  kpi,
  value,
  foot,
  loading,
}: {
  label: string;
  kpi?: OverviewKpi;
  value: string;
  foot: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="ah-card ah-kpi">
      <p className="ah-eyebrow">{label}</p>
      {loading ? (
        <div className="ah-skeleton" style={{ height: 38, margin: "9px 0 6px", width: "60%" }} />
      ) : (
        <div className="ah-metric is-lg">{value}</div>
      )}
      {!loading && <div className="ah-kpi-foot">{foot}</div>}
      {!loading && kpi && <Sparkline values={kpi.series} />}
    </div>
  );
}

function KpiStrip({
  data,
  loading,
  failed,
  onRetry,
  range,
  city,
}: {
  data?: DashboardOverview;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  range: OverviewRange;
  city: string;
}) {
  if (failed && !data) {
    return (
      <section className="ah-card">
        <div className="ah-card-body">
          <div className="ah-card-error" role="alert">
            <span>Could not load the figures.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        </div>
      </section>
    );
  }
  const k = data?.kpis;
  const vs = range === "30d" ? "vs previous 30 days" : "vs previous quarter";
  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-US");
  return (
    <div className="stagger ah-grid ah-g-4">
      <Kpi
        label="Registered players"
        kpi={k?.players}
        loading={loading}
        value={n(k?.players.value)}
        foot={
          <>
            {/* the big number is every player; the delta and the sparkline are
                about new sign-ups, so the line says so */}
            {`${n(k?.players.extra)} new`}
            {k?.players.delta_pct !== null && k?.players.delta_pct !== undefined && (
              <>
                {" · "}
                <Delta pct={k.players.delta_pct} /> {vs}
              </>
            )}
            {/* players have no city: the figure is the whole network */}
            {city && " · network-wide"}
          </>
        }
      />
      <Kpi
        label="Bookings"
        kpi={k?.bookings}
        loading={loading}
        value={n(k?.bookings.value)}
        foot={
          <>
            {k?.bookings.delta_pct !== null && k?.bookings.delta_pct !== undefined && (
              <>
                <Delta pct={k.bookings.delta_pct} /> {vs}
                {" · "}
              </>
            )}
            {`${n(k?.bookings.extra)} today`}
          </>
        }
      />
      <Kpi
        label="Gross bookings value"
        kpi={k?.gross_value}
        loading={loading}
        value={money(k?.gross_value.value ?? 0)}
        foot={
          k?.gross_value.delta_pct !== null && k?.gross_value.delta_pct !== undefined ? (
            <>
              <Delta pct={k.gross_value.delta_pct} /> {vs}
            </>
          ) : (
            "Confirmed and completed bookings"
          )
        }
      />
      <Kpi
        label="Live arenas"
        loading={loading}
        value={n(k?.live_arenas.value)}
        foot={`${n(k?.live_arenas.extra)} pending review`}
      />
    </div>
  );
}

/* ---- decision queue (arenas waiting + open complaints) ---------------------- */
const ArenaIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 21V9l9-6 9 6v12" />
  </svg>
);
const TicketIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
  </svg>
);

function DecisionQueue({ overview, city }: { overview?: DashboardOverview; city: string }) {
  const arenas = useArenaQueue("pending", 1);
  const complaints = useComplaints({ status: "open", page: 1 });
  const { approve, reject } = useArenaVerification();
  const [rejecting, setRejecting] = useState<Arena | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = [
    ...(arenas.data?.items ?? []).map((a) => ({
      kind: "arena" as const,
      key: a.id,
      at: a.created_at,
      title: `${a.name}, ${a.city}`,
      sub: `${a.address} · submitted ${new Date(a.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
      arena: a,
    })),
    ...(complaints.data?.items ?? []).map((c) => ({
      kind: "complaint" as const,
      key: c.id,
      at: c.created_at,
      title: `Complaint · ${c.category.replace(/_/g, " ")}`,
      sub: `${c.player_name} · ${c.description.slice(0, 80)}`,
      arena: null,
    })),
  ]
    .sort((x, y) => x.at.localeCompare(y.at))
    .slice(0, 5);

  const loading = arenas.isLoading || complaints.isLoading;
  const failed = arenas.isError || complaints.isError;
  // counts come from the lists the rows come from (pending arenas, open
  // complaints: both network-wide), so the strip and the rows always agree
  const pendingArenas = arenas.data?.total ?? 0;
  const openComplaints = complaints.data?.total ?? 0;
  const waiting = pendingArenas + openComplaints;
  // every waiting item is on screen unless a list has more than one page
  const allFetched =
    (arenas.data?.items.length ?? 0) >= pendingArenas &&
    (complaints.data?.items.length ?? 0) >= openComplaints;
  const oldestAt = overview?.queue.oldest_waiting_at ?? (allFetched ? items[0]?.at : undefined);
  const oldest = oldestAt ? daysAgo(oldestAt) : null;

  async function onReject(reason: string) {
    if (!rejecting) return;
    setError(null);
    try {
      await reject.mutateAsync({ arenaId: rejecting.id, reason });
      setRejecting(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reject the arena.");
    }
  }

  return (
    <section className="ah-card">
      <div className="ah-card-head">
        <div style={{ marginRight: "auto" }}>
          <h2 className="ah-h2">Decision queue</h2>
          <p className="ah-mute" style={{ fontSize: 12, margin: "2px 0 0" }}>
            {loading || failed
              ? " "
              : waiting === 0
                ? "Nothing is waiting on an admin."
                : `${waiting} item${waiting === 1 ? " is" : "s are"} waiting on an admin.` +
                  (oldest !== null
                    ? ` Oldest has been open ${oldest} day${oldest === 1 ? "" : "s"}.`
                    : "")}
            {/* the queue is the whole network's, whatever city is picked above */}
            {city && " Network-wide."}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/arenas">Open queue</Link>
        </Button>
      </div>
      <div className="ah-queue ah-queue-2">
        <Link href="/admin/arenas" className="ah-queue-cell">
          <span className="ah-metric">{pendingArenas.toLocaleString("en-US")}</span>
          <span className="ah-queue-lbl">{pendingArenas === 1 ? "Arena" : "Arenas"} to verify</span>
        </Link>
        <Link href="/admin/complaints" className="ah-queue-cell">
          <span className="ah-metric">{openComplaints.toLocaleString("en-US")}</span>
          <span className="ah-queue-lbl">{openComplaints === 1 ? "Complaint" : "Complaints"} open</span>
        </Link>
      </div>
      {loading && (
        <div className="ah-card-body">
          <div className="ah-skeleton" style={{ height: 120 }} />
        </div>
      )}
      {failed && (
        <div className="ah-card-body">
          <div className="ah-card-error" role="alert">
            <span>Could not load the queue.</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void arenas.refetch();
                void complaints.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
      {!loading && !failed && items.length === 0 && (
        <div className="ah-card-body">
          <p className="ah-empty-line">Nothing needs a decision right now.</p>
        </div>
      )}
      {!loading && !failed && items.length > 0 && (
        <table className="ah-queue-table">
          <tbody>
            {items.map((it) => {
              const age = daysAgo(it.at);
              return (
                <tr key={it.key}>
                  <td style={{ width: 40 }}>
                    <span
                      className={cn("ah-q-ico", it.kind === "arena" ? "ah-q-arena" : "ah-q-flag")}
                    >
                      {it.kind === "arena" ? ArenaIcon : TicketIcon}
                    </span>
                  </td>
                  <td>
                    <div className="ah-strong">{it.title}</div>
                    <div className="ah-sub">{it.sub}</div>
                  </td>
                  <td className="ah-r">
                    <AdminBadge tone={age > 2 ? "off" : "wait"}>open {age}d</AdminBadge>
                  </td>
                  <td className="ah-r" style={{ width: 200 }}>
                    <div className="flex justify-end gap-1.5">
                      {it.kind === "arena" && it.arena ? (
                        <>
                          <Button
                            size="sm"
                            className="ah-lime"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate(it.arena!.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRejecting(it.arena)}
                          >
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Button asChild size="sm">
                          <Link href="/admin/complaints">Open</Link>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {!loading && !failed && (
        <div className="ah-tbl-foot">
          {items.length === 0
            ? "Nothing waiting"
            : allFetched
              ? `Showing the ${items.length} oldest item${items.length === 1 ? "" : "s"}`
              : `Showing ${items.length} of ${waiting} waiting items`}
          {/* nothing to see when nothing is waiting */}
          {waiting > 0 && (
            <Button asChild variant="ghost" size="sm" style={{ marginLeft: "auto" }}>
              <Link href="/admin/arenas">See all {waiting}</Link>
            </Button>
          )}
        </div>
      )}
      <TextInputDialog
        open={!!rejecting}
        onOpenChange={(v) => !v && setRejecting(null)}
        title="Reject arena"
        description={rejecting ? `${rejecting.name} will be notified with your reason.` : undefined}
        placeholder="Reason for rejection…"
        confirmLabel="Reject Arena"
        destructive
        pending={reject.isPending}
        error={error}
        onSubmit={onReject}
      />
    </section>
  );
}

/* ---- page ------------------------------------------------------------------- */
export default function AdminDashboardPage() {
  const [city, setCity] = useState("");
  const [range, setRange] = useState<OverviewRange>("30d");
  const { data, isLoading, isError, refetch } = useDashboardOverview({
    city: city || undefined,
    range,
  });
  const state = (hasData: boolean) =>
    isLoading ? "loading" : isError ? "error" : hasData ? "ready" : "empty";
  const retry = () => void refetch();

  const now = data?.bookings_by_day.map((d) => d.value) ?? [];
  const prev = data?.previous_bookings_by_day.map((d) => d.value) ?? [];
  const labels = dayLabels(data?.bookings_by_day ?? []);
  const totalCity = data?.by_city.reduce((s, c) => s + c.bookings, 0) ?? 0;
  const hours = data?.utilisation_by_hour ?? [];
  // no peak bar when nothing is booked (every hour a 0% stub)
  const peakIdx = hours.some((h) => h.pct > 0)
    ? hours.reduce((best, h, i) => (h.pct > hours[best].pct ? i : best), 0)
    : -1;

  return (
    <>
      <PageHeader eyebrow={todayLine(city)} title="Dashboard">
        <Select value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
          <option value="">All cities</option>
          {ARENA_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={range}
          onChange={(e) => setRange(e.target.value as OverviewRange)}
          aria-label="Period"
        >
          <option value="30d">{RANGE_LABEL["30d"].option}</option>
          <option value="quarter">{RANGE_LABEL.quarter.option}</option>
        </Select>
      </PageHeader>

      <div className="animate-fade-in ah-stack">
        <KpiStrip
          data={data}
          loading={isLoading}
          failed={isError}
          onRetry={retry}
          range={range}
          city={city}
        />

        <div className="ah-grid ah-g-32">
          <OverviewCard
            title="Bookings across the network"
            state={state(now.some((v) => v > 0) || prev.some((v) => v > 0))}
            onRetry={retry}
            empty="No bookings in this period."
            actions={
              <div
                className="ah-row"
                style={{ gap: 14, fontSize: 11.5, color: "var(--muted-foreground)" }}
              >
                <span className="ah-row" style={{ gap: 5 }}>
                  <i className="ah-legend-swatch" style={{ background: "var(--ink)" }} />
                  {RANGE_LABEL[range].now}
                </span>
                <span className="ah-row" style={{ gap: 5 }}>
                  <i className="ah-legend-swatch" style={{ background: "var(--line)" }} />
                  {RANGE_LABEL[range].prev}
                </span>
              </div>
            }
          >
            <LineChart
              now={now}
              prev={prev}
              labels={labels}
              tip={String(now[now.length - 1] ?? 0)}
            />
          </OverviewCard>

          <OverviewCard
            title="Bookings by city"
            state={state(totalCity > 0)}
            onRetry={retry}
            empty="No bookings in this period."
          >
            <Donut
              total={totalCity}
              // whole percentages, as the prototype shows them
              shares={(data?.by_city ?? []).map((c) => ({
                label: c.city,
                pct: Math.round(c.share_pct),
              }))}
            />
          </OverviewCard>
        </div>

        <div className="ah-grid ah-g-2">
          <OverviewCard
            title="Network utilisation by hour"
            state={state(hours.some((h) => h.total > 0))}
            onRetry={retry}
            empty="No slots in this period."
            actions={
              data?.peak_window ? (
                <span className="ah-tag">
                  Peak {hourRange(data.peak_window.start_hour, data.peak_window.end_hour)}
                </span>
              ) : undefined
            }
          >
            <HourBars
              peakIdx={peakIdx}
              data={hours.map((h) => ({
                label: hourLabel(h.hour),
                value: h.pct,
                title: `${hourLabel(h.hour)}: ${h.pct}% booked (${h.used} of ${plural(h.total, "slot")})`,
              }))}
            />
          </OverviewCard>

          <OverviewCard
            title={range === "30d" ? "Top arenas, last 30 days" : "Top arenas this quarter"}
            actions={
              <Button asChild variant="ghost" size="sm" style={{ marginLeft: "auto" }}>
                <Link href="/admin/arenas/all">View all</Link>
              </Button>
            }
            state={state((data?.top_arenas.length ?? 0) > 0)}
            onRetry={retry}
            empty="No bookings in this period."
          >
            <RankList
              items={(data?.top_arenas ?? []).map((a) => ({
                key: a.arena_id,
                name: a.name,
                sub: `${a.city} · ${a.bookings} booking${a.bookings === 1 ? "" : "s"}`,
                value: formatRs(Math.round(a.value)),
                amount: a.value,
              }))}
            />
          </OverviewCard>
        </div>

        <DecisionQueue overview={data} city={city} />
      </div>
    </>
  );
}
