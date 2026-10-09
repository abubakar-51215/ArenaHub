"use client";

import { useEffect, useState } from "react";

import { karachiMinutes } from "@/lib/karachi-date";

/**
 * Sweeping "now" indicator for the Live Board grid. Owns its 60s tick
 * entirely internally — `openMinutes`/`closeMinutes` are stable props from
 * the parent (they only change when the selected arena changes, never on
 * tick) — so this is the sole re-render boundary for the sweep: no parent
 * component re-renders on the clock, only this leaf does. The open/close
 * visibility check also lives in this tick, not computed once by the
 * parent at render time, so the line correctly appears/disappears right at
 * opening/closing without needing a second timer anywhere else.
 */
export function NowLine({ openMinutes, closeMinutes }: { openMinutes: number; closeMinutes: number }) {
  const [now, setNow] = useState(karachiMinutes);

  useEffect(() => {
    const id = setInterval(() => setNow(karachiMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (now < openMinutes || now > closeMinutes || closeMinutes <= openMinutes) return null;

  const pct = ((now - openMinutes) / (closeMinutes - openMinutes)) * 100;
  const h = Math.floor(now / 60);
  const label = `NOW ${h % 12 || 12}:${String(now % 60).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;

  // prototype .now-line: a lime-deep line with its time label on top
  return <div className="ah-now-line" style={{ left: `${pct}%` }} data-t={label} aria-label={label} role="img" />;
}
