"use client";

import { useMemo, useState } from "react";
import { BarChart3, Download, Loader2, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/owner/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useMyArenas } from "@/hooks/useArenas";
import { toDateInput } from "@/lib/format";
import { ApiError } from "@/services/api";
import {
  downloadOwnerReport,
  type OwnerReportType,
  type ReportFormat,
} from "@/services/reports";

const REPORTS: {
  type: OwnerReportType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: "bookings",
    title: "Bookings & revenue",
    description: "Every booking in the period with its court, customer, status and amount.",
    icon: BarChart3,
  },
  {
    type: "occupancy",
    title: "Occupancy & peak usage",
    description: "How full each court was, and which hours are busiest.",
    icon: TrendingUp,
  },
];

type Status = { kind: "idle" } | { kind: "busy"; key: string } | { kind: "error"; message: string };

export default function ReportsPage() {
  const { data: arenaPage, isLoading: arenasLoading, isError: arenasError } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);

  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const [arenaId, setArenaId] = useState("");
  const [dateFrom, setDateFrom] = useState(toDateInput(monthStart));
  const [dateTo, setDateTo] = useState(toDateInput(today));
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const rangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const noArenas = !arenasLoading && !arenasError && arenas.length === 0;

  async function download(type: OwnerReportType, format: ReportFormat) {
    const key = `${type}-${format}`;
    setStatus({ kind: "busy", key });
    try {
      await downloadOwnerReport({
        type,
        format,
        arenaId: arenaId || undefined,
        dateFrom,
        dateTo,
      });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : "Could not download the report.",
      });
    }
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="Download your arenas' figures as CSV or PDF" />

      <div className="animate-fade-in space-y-6 p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Period and arena</CardTitle>
            <CardDescription>These choices apply to every report below.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-from">From</Label>
              <Input
                id="report-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">To</Label>
              <Input
                id="report-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-arena">Arena</Label>
              <Select
                id="report-arena"
                value={arenaId}
                onChange={(e) => setArenaId(e.target.value)}
                disabled={arenasLoading}
              >
                <option value="">All arenas</option>
                {arenas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            {rangeInvalid && (
              <p role="alert" className="text-sm text-destructive sm:col-span-3">
                The start date must be on or before the end date.
              </p>
            )}
            {arenasError && (
              <p role="alert" className="text-sm text-destructive sm:col-span-3">
                Could not load your arenas. You can still download a report for all arenas.
              </p>
            )}
            {noArenas && (
              <p className="text-sm text-muted-foreground sm:col-span-3">
                You have no arenas yet, so a report would be empty. Add an arena first.
              </p>
            )}
          </CardContent>
        </Card>

        {status.kind === "error" && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {status.message}
          </p>
        )}

        <div className="stagger grid gap-4 lg:grid-cols-2">
          {REPORTS.map(({ type, title, description, icon: Icon }) => (
            <Card key={type}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                    <Icon className="size-4" />
                  </span>
                  <CardTitle>{title}</CardTitle>
                </div>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(["csv", "pdf"] as const).map((format) => {
                  const busy = status.kind === "busy" && status.key === `${type}-${format}`;
                  return (
                    <Button
                      key={format}
                      variant="outline"
                      disabled={rangeInvalid || status.kind === "busy" || noArenas}
                      onClick={() => download(type, format)}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      {busy ? "Preparing…" : format.toUpperCase()}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
