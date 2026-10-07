"use client";

import { useState } from "react";

import { HourBars, LineChart } from "@/components/admin/charts";
import {
  Delta,
  OverviewCard,
  RANGE_LABEL,
  dayLabels,
  hourRange,
  money,
} from "@/components/admin/overview-parts";
import { PageHeader } from "@/components/admin/page-header";
import { AdminCard, AdminField, AdminKpi, AdminTag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDashboardOverview } from "@/hooks/useAdminOverview";
import type { OverviewRange } from "@/services/admin-overview";
import { downloadAdminReport, type AdminReportType } from "@/services/reports";

const REPORT_TYPES: { value: AdminReportType; label: string }[] = [
  { value: "users", label: "Users" },
  { value: "bookings", label: "Bookings" },
  { value: "revenue", label: "Revenue" },
  { value: "arenas", label: "Arenas" },
  { value: "system", label: "System (peak hours & popular sports)" },
];

/** "8 September – 7 October 2026 · all cities", like the prototype's sub-line. */
function periodLine(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const fmt = (iso: string, withYear: boolean) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return `${fmt(start, false)} – ${fmt(end, true)} · all cities`;
}

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState<OverviewRange>("30d");
  const { data, isLoading, isError, refetch } = useDashboardOverview({ range });
  const state = (hasData: boolean) =>
    isLoading ? "loading" : isError ? "error" : hasData ? "ready" : "empty";
  const retry = () => void refetch();

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

  const k = data?.kpis;
  const topCity = data?.by_city[0];
  const revenue = data?.kpis.gross_value.series ?? [];
  const totalCity = data?.by_city.reduce((s, c) => s + c.bookings, 0) ?? 0;
  const vs = range === "30d" ? "vs previous 30 days" : "vs previous quarter";
  const dash = isLoading ? "—" : undefined;

  return (
    <>
      <PageHeader title="Analytics" subtitle={periodLine(data?.period.start, data?.period.end)}>
        <Select
          value={range}
          aria-label="Period"
          onChange={(e) => setRange(e.target.value as OverviewRange)}
        >
          <option value="30d">{RANGE_LABEL["30d"].option}</option>
          <option value="quarter">{RANGE_LABEL.quarter.option}</option>
        </Select>
      </PageHeader>

      <div className="animate-fade-in ah-stack">
        {isError && !data ? (
          <section className="ah-card">
            <div className="ah-card-body">
              <div className="ah-card-error" role="alert">
                <span>Could not load the figures.</span>
                <Button variant="outline" size="sm" onClick={retry}>
                  Try again
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <div className="stagger ah-grid ah-g-4">
            <AdminKpi
              label="Top city"
              value={dash ?? topCity?.city ?? "—"}
              foot={
                topCity
                  ? `${topCity.bookings.toLocaleString("en-US")} bookings · ${Math.round(topCity.share_pct)}%`
                  : undefined
              }
            />
            <AdminKpi
              label="Bookings"
              value={dash ?? (k?.bookings.value ?? 0).toLocaleString("en-US")}
              foot={
                k && k.bookings.delta_pct !== null ? (
                  <>
                    <Delta pct={k.bookings.delta_pct} /> {vs}
                  </>
                ) : undefined
              }
            />
            <AdminKpi
              label="Gross bookings value"
              value={dash ?? money(k?.gross_value.value ?? 0)}
              foot={
                k && k.gross_value.delta_pct !== null ? (
                  <>
                    <Delta pct={k.gross_value.delta_pct} /> {vs}
                  </>
                ) : undefined
              }
            />
            <AdminKpi
              label="Peak hours"
              value={
                dash ??
                (data?.peak_window
                  ? hourRange(data.peak_window.start_hour, data.peak_window.end_hour)
                  : "—")
              }
              foot={data?.peak_window ? "Most booked three hours" : undefined}
            />
          </div>
        )}

        <div className="ah-grid ah-g-2">
          <OverviewCard
            title="Revenue over time"
            state={state(revenue.some((v) => v > 0))}
            onRetry={retry}
            empty="No confirmed bookings in this period."
            actions={k ? <AdminTag>{money(k.gross_value.value)}</AdminTag> : undefined}
          >
            <LineChart
              now={revenue}
              labels={dayLabels(data?.bookings_by_day ?? [])}
              tip={money(revenue[revenue.length - 1] ?? 0)}
            />
          </OverviewCard>

          <OverviewCard
            title="Bookings by city"
            state={state(totalCity > 0)}
            onRetry={retry}
            empty="No bookings in this period."
          >
            <HourBars
              // the largest city in ink, as the prototype marks its top bar (by_city is sorted)
              peakIdx={0}
              data={(data?.by_city ?? []).map((c) => ({
                label: c.city,
                value: c.bookings,
                title: `${c.city}: ${c.bookings.toLocaleString("en-US")} bookings`,
              }))}
            />
          </OverviewCard>
        </div>

        <OverviewCard
          title="City comparison"
          state={state(totalCity > 0)}
          onRetry={retry}
          empty="No bookings in this period."
          actions={<AdminTag>{RANGE_LABEL[range].now}</AdminTag>}
          className="ah-card-flush"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>City</TableHead>
                <TableHead className="ah-r">Bookings</TableHead>
                <TableHead className="ah-r">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.by_city ?? []).map((c) => (
                <TableRow key={c.city}>
                  <TableCell className="ah-strong">{c.city}</TableCell>
                  <TableCell className="ah-r tabular-nums">
                    {c.bookings.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="ah-r tabular-nums">{Math.round(c.share_pct)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </OverviewCard>

        <AdminCard title="Downloadable reports" className="ah-reports-card">
          <div className="ah-card-body ah-stack">
            <p className="ah-mute" style={{ margin: 0, fontSize: 13 }}>
              Export a platform-wide report as CSV or PDF. The date range applies to bookings and
              revenue only; users, arenas and the system summary always cover all current data.
            </p>
            <div className="ah-grid ah-g-3" style={{ gap: 16 }}>
              <AdminField>
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
              </AdminField>
              <AdminField>
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </AdminField>
              <AdminField>
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </AdminField>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={downloading}
                onClick={() => handleDownload("csv")}
              >
                Export CSV
              </Button>
              <Button disabled={downloading} onClick={() => handleDownload("pdf")}>
                Download PDF
              </Button>
            </div>
          </div>
        </AdminCard>
      </div>
    </>
  );
}
