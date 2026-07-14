"use client";

/**
 * Dashboard charts (design/wireframes/ArenaOwners.PNG screens 2 & 8).
 *
 * Mark specs follow the dataviz method: 2px lines with a ~10%-opacity area
 * wash, bars ≤24px with 4px rounded data-ends (square at the baseline),
 * hairline solid gridlines, axis text in muted ink (never the series color).
 * The categorical palette below is validator-passed (CVD ΔE ≥ 24 adjacent);
 * the lighter slots' sub-3:1 contrast is relieved by the donut's legend
 * labelling every slice with name + percentage.
 */

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

/** Validated categorical order — assign slots in sequence, never cycle. */
export const CHART_CATEGORICAL = [
  "#2a78d6",
  "#1baf7a",
  "#eda100",
  "#008300",
  "#4a3aa7",
  "#e34948",
  "#e87ba4",
  "#eb6834",
] as const;

const GREEN = "#16a34a"; // wireframe's revenue-line green (logo green)
const BLUE = "#2563eb"; // wireframe's bar blue (app primary blue)
const GRID = "#e5e7eb";
const TICK = { fontSize: 11, fill: "#6b7280" } as const;

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 12,
  padding: "6px 10px",
} as const;

export function RevenueTrendChart({ data }: { data: { label: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} />
        <YAxis
          tick={TICK}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => compactNumber(v)}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => [formatRs(Number(value)), "Revenue"]}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke={GREEN}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill={GREEN}
          fillOpacity={0.1}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function BookingsByTimeChart({ data }: { data: { hour: number; count: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: formatHour(d.hour) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={false} interval={2} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "#f3f4f6" }}
          formatter={(value) => [value, "Bookings"]}
        />
        <Bar dataKey="count" fill={BLUE} maxBarSize={24} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
}

export function EarningsByArenaDonut({ data }: { data: DonutSlice[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width="55%" height={200}>
        <PieChart>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value, name) => [formatRs(Number(value)), name]}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="90%"
            stroke="#ffffff"
            strokeWidth={2}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={CHART_CATEGORICAL[i % CHART_CATEGORICAL.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex-1 space-y-2">
        {data.map((entry, i) => (
          <li key={entry.name} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CHART_CATEGORICAL[i % CHART_CATEGORICAL.length] }}
            />
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
