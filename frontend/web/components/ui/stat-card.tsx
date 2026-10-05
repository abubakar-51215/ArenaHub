import { cn } from "@/lib/utils";

export type StatCardSize = "sm" | "md" | "lg";

export interface StatCardDelta {
  /** Omit direction/percent for a plain descriptive foot row with no
   * up/down reading at all (e.g. "Most booked window"). */
  direction?: "up" | "down";
  percent?: string;
  context: string;
}

export interface StatCardProps {
  label: string;
  /** Pre-formatted by the caller (currency, percentage, etc. already applied). */
  value: string;
  delta?: StatCardDelta;
  /** Chronological series for the sparkline. Fewer than 2 points renders no
   * sparkline at all — no empty placeholder. */
  history?: number[];
  size?: StatCardSize;
  className?: string;
}

/** Builds a { direction, percent, context } delta from a raw numeric change,
 * matching the prototype's bare "▲ 10.5%" / "▲ 4pts" convention (no "+" sign
 * — the arrow already carries direction). Returns undefined for null/undefined
 * input so callers can pass API fields straight through. */
export function numericDelta(
  value: number | null | undefined,
  suffix: string,
  context: string,
): StatCardDelta | undefined {
  if (value == null) return undefined;
  return { direction: value >= 0 ? "up" : "down", percent: `${Math.abs(value)}${suffix}`, context };
}

const METRIC_CLASS: Record<StatCardSize, string> = {
  sm: "metric-sm",
  md: "metric",
  lg: "metric-lg",
};

const SPARK_W = 200;
const SPARK_H = 34;
const SPARK_PAD = 2;

/** Mirrors design/prototypes/*.html's series() helper exactly (same padding,
 * same 12%-headroom max, same 0 floor) — with one addition: `|| 1` guards the
 * range so an all-zero history (a real possibility, e.g. a new arena with no
 * revenue yet this week) doesn't divide by zero. The prototype never handles
 * this because it was never fed real data. */
function buildSparkPaths(values: number[]) {
  const max = Math.max(...values) * 1.12 || 1;
  const min = 0;
  const step = (SPARK_W - SPARK_PAD * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = SPARK_PAD + i * step;
    const y = SPARK_H - SPARK_PAD - ((v - min) / (max - min)) * (SPARK_H - SPARK_PAD * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX] = pts[pts.length - 1];
  const area = `${line} L${lastX.toFixed(1)} ${SPARK_H - SPARK_PAD} L${SPARK_PAD} ${SPARK_H - SPARK_PAD} Z`;
  return { line, area };
}

/**
 * KPI tile — sparkline-based composition (design/prototypes/arena-hub-owner.html
 * & arena-hub-admin.html, ".kpi" cards). Eyebrow label, condensed metric value,
 * optional delta/context foot row, optional sparkline.
 *
 * The sparkline is always rendered in the lime accent regardless of delta
 * direction — direction is read from the delta chip alone (up = --success,
 * down = --destructive), matching the prototype exactly. A history of fewer
 * than 2 points omits the sparkline entirely rather than showing an empty
 * placeholder.
 */
export function StatCard({ label, value, delta, history, size = "md", className }: StatCardProps) {
  const hasSpark = (history?.length ?? 0) >= 2;
  const paths = hasSpark ? buildSparkPaths(history!) : null;

  return (
    <div
      data-variant={hasSpark ? "spark" : "plain"}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card px-4.25 pt-3.75",
        hasSpark ? "pb-3.25" : "pb-3.75",
        className,
      )}
    >
      <p className="eyebrow">{label}</p>
      <p className={cn(METRIC_CLASS[size], "mt-2.25 mb-1.5 text-foreground")}>{value}</p>

      {delta && (
        <div className="flex items-center gap-1.75 text-[11.5px] text-muted-foreground">
          {delta.direction && delta.percent && (
            <span
              className={cn(
                "inline-flex items-center gap-0.75 text-xs font-semibold",
                delta.direction === "up" ? "text-success" : "text-destructive",
              )}
            >
              {delta.direction === "up" ? "▲" : "▼"} {delta.percent}
            </span>
          )}
          {delta.context}
        </div>
      )}

      {hasSpark && paths && (
        <svg
          className="mt-2 block h-8.5 w-full"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
        >
          <path d={paths.area} fill="var(--success-muted)" />
          <path
            d={paths.line}
            fill="none"
            stroke="var(--success)"
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
