"use client";

/**
 * Dashboard charts (design/wireframes/ArenaOwners.PNG screens 2 & 8).
 *
 * Mark specs follow the dataviz method: 2px lines with a ~10%-opacity area
 * wash, bars ≤24px with 4px rounded data-ends (square at the baseline),
 * hairline solid gridlines, axis text in muted ink (never the series color).
 *
 * Colours are read at runtime from the [data-theme="arena"] custom
 * properties (globals.css) via getComputedStyle — Recharts sets fill/stroke
 * as literal SVG attributes, so `fill="var(--chart-1)"` never resolves.
 * Each chart reads from a ref inside its own subtree rather than
 * DashboardShell's literal root node: custom properties inherit, so any
 * descendant of the [data-theme="arena"] element resolves the same values.
 * The hex fallbacks below equal the current arena tokens exactly, so first
 * paint (server render, before the effect runs) is already correct.
 */

import { useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { compactNumber, formatHour, formatRs } from "@/lib/format";

// Fallback only: these match the arena theme tokens and apply if the runtime read fails.
const FALLBACK_COLORS = {
  chart1: "#c4f546",
  chart2: "#0f1a15",
  chart3: "#5a6b61",
  chart4: "#93a29a",
  chart5: "#c6cfc9",
  border: "#e2e6e1",
  mutedForeground: "#79857e",
  card: "#ffffff",
  muted: "#edefeb",
} as const;

type ArenaColors = Record<keyof typeof FALLBACK_COLORS, string>;

// TODO: extract to lib/ when a second caller appears — this hook is generic
// (any DOM node inside [data-theme="arena"] resolving its own custom
// properties), so the next thing that needs a literal runtime colour (a
// canvas viz, a third-party component, a dynamic SVG fill) will just
// copy-paste it otherwise.
/** Reads the [data-theme="arena"] chart tokens once on mount. No theme
 * toggle exists yet, so one-time-on-mount is sufficient — revisit if a
 * toggle is added later. */
function useArenaColors<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [colors, setColors] = useState<ArenaColors>(FALLBACK_COLORS);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setColors({
      chart1: read("--chart-1", FALLBACK_COLORS.chart1),
      chart2: read("--chart-2", FALLBACK_COLORS.chart2),
      chart3: read("--chart-3", FALLBACK_COLORS.chart3),
      chart4: read("--chart-4", FALLBACK_COLORS.chart4),
      chart5: read("--chart-5", FALLBACK_COLORS.chart5),
      border: read("--border", FALLBACK_COLORS.border),
      mutedForeground: read("--muted-foreground", FALLBACK_COLORS.mutedForeground),
      card: read("--card", FALLBACK_COLORS.card),
      muted: read("--muted", FALLBACK_COLORS.muted),
    });
  }, []);

  return { ref, colors };
}

const TOOLTIP_STYLE_BASE = {
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
} as const;

export function RevenueTrendChart({ data }: { data: { label: string; amount: number }[] }) {
  const { ref, colors } = useArenaColors<HTMLDivElement>();
  const tick = { fontSize: 12, fill: colors.mutedForeground };
  const tooltipStyle = { ...TOOLTIP_STYLE_BASE, border: `1px solid ${colors.border}` };

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.border} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
          <YAxis
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatRs(Number(value)), "Revenue"]}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={colors.chart1}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill={colors.chart1}
            fillOpacity={0.1}
            activeDot={{ r: 4, strokeWidth: 2, stroke: colors.card }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BookingsByTimeChart({ data }: { data: { hour: number; count: number }[] }) {
  const { ref, colors } = useArenaColors<HTMLDivElement>();
  const tick = { fontSize: 12, fill: colors.mutedForeground };
  const tooltipStyle = { ...TOOLTIP_STYLE_BASE, border: `1px solid ${colors.border}` };
  const rows = data.map((d) => ({ ...d, label: formatHour(d.hour) }));

  return (
    <div ref={ref}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.border} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} interval={2} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: colors.muted }}
            formatter={(value) => [value, "Bookings"]}
          />
          <Bar dataKey="count" fill={colors.chart1} maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
}

const DONUT_MAX_SLICES = 5;

/** Sorts descending and collapses everything past the top 4 into a single
 * "Other (N)" slice — the arena palette is a rank ramp (lime → 3 greys →
 * lightest grey), not a categorical set, so the biggest arena always lands
 * on --chart-1 and overflow always lands on the lightest grey. Sorts
 * defensively rather than trusting the caller. */
function capSlices(data: DonutSlice[]): DonutSlice[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= DONUT_MAX_SLICES) return sorted;

  const head = sorted.slice(0, DONUT_MAX_SLICES - 1);
  const overflow = sorted.slice(DONUT_MAX_SLICES - 1);
  const overflowValue = overflow.reduce((sum, d) => sum + d.value, 0);
  return [...head, { name: `Other (${overflow.length})`, value: overflowValue }];
}

export function EarningsByArenaDonut({ data }: { data: DonutSlice[] }) {
  const { ref, colors } = useArenaColors<HTMLDivElement>();
  const tooltipStyle = { ...TOOLTIP_STYLE_BASE, border: `1px solid ${colors.border}` };
  const ramp = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];
  const slices = capSlices(data);
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  return (
    <div ref={ref} className="flex items-center gap-6">
      <ResponsiveContainer width="55%" height={200}>
        <PieChart>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatRs(Number(value)), name]}
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="90%"
            stroke={colors.card}
            strokeWidth={2}
          >
            {slices.map((entry, i) => (
              <Cell key={entry.name} fill={ramp[i]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-2">
        {slices.map((entry, i) => (
          <li key={entry.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ramp[i] }} />
            <span className="flex-1 truncate text-muted-foreground">{entry.name}</span>
            <span className="font-medium text-foreground">
              {total ? Math.round((entry.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
