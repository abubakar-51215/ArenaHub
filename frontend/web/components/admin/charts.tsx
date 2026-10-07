/**
 * The admin prototype's charts, rebuilt in React with the same geometry and
 * colours (design/prototypes/arena-hub-admin.html: series(), lineChart(),
 * renderSparks(), renderDonut(), bars(), renderTopArenas()). Plain SVG, no
 * chart library, so the result matches the prototype stroke for stroke.
 */
import { cn } from "@/lib/utils";

function series(vals: number[], w: number, h: number, pad: number) {
  const max = Math.max(...vals, 0) * 1.12 || 1;
  const step = vals.length > 1 ? (w - pad * 2) / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)] as const);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] ?? [pad, h - pad];
  const area = `${line} L${last[0].toFixed(1)} ${h - pad} L${pad} ${h - pad} Z`;
  return { line, area, pts };
}

/** KPI sparkline (prototype .spark: 200x34, lime-wash area, lime-deep line). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const s = series(values, 200, 34, 2);
  return (
    <svg className="ah-spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={s.area} fill="var(--lime-wash)" />
      <path d={s.line} fill="none" stroke="var(--lime-deep)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

/** "Bookings across the network": current period (ink line over lime wash)
 *  against the previous one (dashed line), 720x220 as in the prototype. */
export function LineChart({
  now,
  prev,
  labels,
  tip,
}: {
  now: number[];
  prev?: number[];
  labels: string[];
  tip: string;
}) {
  const W = 720;
  const H = 220;
  const P = 26;
  const a = series(now, W, H, P);
  // the previous period is scaled on its own max, exactly like the prototype
  const b = prev && prev.length > 1 ? series(prev, W, H, P) : null;
  const last = a.pts[a.pts.length - 1];
  return (
    <svg className="ah-chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bookings per day">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = P + (i * (H - P * 2)) / 4;
        return <line key={i} x1={P} x2={W - P} y1={y} y2={y} stroke="var(--line-soft)" />;
      })}
      <path d={a.area} fill="var(--lime-wash)" opacity=".8" />
      {b && <path d={b.line} fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 4" />}
      <path d={a.line} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />
      {a.pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.8" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
      ))}
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="5.5" fill="var(--lime)" stroke="var(--ink)" strokeWidth="2" />
          <text x={last[0] - 8} y={last[1] - 14} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--text)">
            {tip}
          </text>
        </>
      )}
      {labels.map((l, i) =>
        l && a.pts[i] ? (
          <text key={i} x={a.pts[i][0]} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

const DONUT_COLOURS = ["var(--lime)", "var(--ink)", "#5A6B61", "#AAB6AF"];

/** "Bookings by city": 132px donut, 20px ring, with the legend list. */
export function Donut({
  shares,
  total,
}: {
  shares: { label: string; pct: number }[];
  total: number;
}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div className="ah-row" style={{ gap: 22, alignItems: "center" }}>
      <svg width="132" height="132" viewBox="0 0 132 132" style={{ flex: "none" }} role="img" aria-label="Bookings by city">
        {shares.map((s, i) => {
          const len = (C * s.pct) / 100;
          const seg = (
            <circle
              key={s.label}
              cx="66"
              cy="66"
              r={R}
              fill="none"
              stroke={DONUT_COLOURS[i % DONUT_COLOURS.length]}
              strokeWidth="20"
              strokeDasharray={`${Math.max(len - 2, 0)} ${C - len + 2}`}
              strokeDashoffset={-off}
              transform="rotate(-90 66 66)"
            />
          );
          off += len;
          return seg;
        })}
        <text x="66" y="63" textAnchor="middle" fontFamily="var(--font-archivo), sans-serif" fontSize="20" fontWeight="700" fill="var(--text)">
          {total.toLocaleString("en-US")}
        </text>
        <text x="66" y="78" textAnchor="middle" fontSize="9.5" fill="var(--muted-foreground)" letterSpacing="1">
          BOOKINGS
        </text>
      </svg>
      <ul className="ah-legend-list">
        {shares.map((s, i) => (
          <li key={s.label}>
            <i style={{ background: DONUT_COLOURS[i % DONUT_COLOURS.length] }} />
            {s.label}
            <b>{s.pct}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "Network utilisation by hour": prototype .bars (132px tall, peak bar ink). */
export function HourBars({ data, peakIdx }: { data: { label: string; value: number; title: string }[]; peakIdx: number }) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  return (
    <div className="ah-bars">
      {data.map((d, i) => (
        <div key={d.label} className="ah-bar-col" title={d.title}>
          <div className={cn("ah-bar", i === peakIdx && "is-peak")} style={{ height: `${(d.value / max) * 100}%` }} />
          <div className="ah-bar-lbl">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

/** "Top arenas": prototype .rank list with a value bar under each row. */
export function RankList({ items }: { items: { key: string; name: string; sub: string; value: string; amount: number }[] }) {
  const max = Math.max(...items.map((a) => a.amount), 0) || 1;
  return (
    <div className="ah-rank">
      {items.map((a) => (
        <div key={a.key} className="ah-rank-item">
          <div>
            <b style={{ fontSize: 13 }}>{a.name}</b>
            <div className="ah-sub">{a.sub}</div>
          </div>
          <div className="ah-money" style={{ fontSize: 13 }}>
            {a.value}
          </div>
          <div className="ah-rank-bar">
            <i style={{ width: `${(a.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
