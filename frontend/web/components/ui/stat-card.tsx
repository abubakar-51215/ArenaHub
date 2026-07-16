import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type IconTone = "blue" | "green" | "amber" | "violet" | "red";

const TONES: Record<IconTone, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  red: "bg-red-50 text-red-600",
};

/**
 * Metric tile used across the owner & admin dashboards. Matches the wireframe
 * (label · large value · delta) with a tinted icon tile, a hairline gradient
 * accent along the top, and a soft hover lift.
 */
export function StatCard({
  label,
  value,
  delta,
  deltaSuffix = "vs last period",
  subtitle,
  icon: Icon,
  tone = "blue",
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaSuffix?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: IconTone;
  className?: string;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "accent-top card-elevated relative overflow-hidden rounded-xl border border-border bg-card p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              TONES[tone],
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {delta != null && (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1 text-xs font-medium",
            positive ? "text-emerald-600" : "text-red-600",
          )}
        >
          {positive ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {positive ? "+" : ""}
          {delta}% <span className="font-normal text-muted-foreground">{deltaSuffix}</span>
        </p>
      )}
      {subtitle && <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
