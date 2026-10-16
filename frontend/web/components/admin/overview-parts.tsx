"use client";

/**
 * Pieces shared by the pages built on GET /admin/dashboard/overview (the
 * Dashboard and Analytics): the period labels, money and hour formatting,
 * the day labels under the line chart, the delta chip, and the card shell
 * with its loading skeleton, error-with-retry and empty states.
 */
import { Button } from "@/components/ui/button";
import { formatRs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OverviewRange } from "@/services/admin-overview";

export const RANGE_LABEL: Record<OverviewRange, { now: string; prev: string; option: string }> = {
  "30d": { now: "Last 30 days", prev: "Previous 30 days", option: "Last 30 days" },
  quarter: { now: "This quarter", prev: "Previous quarter", option: "This quarter" },
};

/** "Rs. 7.84M" for millions (as in the prototype), full rupees below that. */
export function money(v: number): string {
  if (v >= 1_000_000) return `Rs. ${(v / 1_000_000).toFixed(2)}M`;
  return formatRs(Math.round(v));
}

export function hourLabel(h: number): string {
  const h12 = h % 12 || 12;
  return `${h12}${h < 12 ? "a" : "p"}`;
}

export function hourRange(start: number, end: number): string {
  const fmt = (h: number) => `${h % 12 || 12}`;
  const suffix = (h: number) => (h % 24 < 12 ? "AM" : "PM");
  return `${fmt(start)}–${fmt(end)} ${suffix(end)}`;
}

/** Labels under a daily line chart: the first day in full, then every third day. */
export function dayLabels(points: { date: string }[]): string[] {
  return points.map((d, i, all) => {
    const day = new Date(d.date + "T00:00:00");
    if (i === 0) return day.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    return i % 3 === 0 || i === all.length - 1 ? String(day.getDate()) : "";
  });
}

export function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={cn("ah-delta", up ? "up" : "down")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

export type CardState = "loading" | "error" | "empty" | "ready";

export function OverviewCard({
  title,
  actions,
  state,
  onRetry,
  empty,
  className,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  state: CardState;
  onRetry: () => void;
  empty?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("ah-card", className)}>
      <div className="ah-card-head">
        {typeof title === "string" ? <h2 className="ah-h2">{title}</h2> : title}
        {state === "ready" && actions}
      </div>
      <div className="ah-card-body">
        {state === "loading" && (
          <div className="ah-skeleton" style={{ height: 160 }} aria-label="Loading" />
        )}
        {state === "error" && (
          <div className="ah-card-error" role="alert">
            <span>Could not load this card.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {state === "empty" && (
          <p className="ah-empty-line">{empty ?? "No data for this period."}</p>
        )}
        {state === "ready" && children}
      </div>
    </section>
  );
}
