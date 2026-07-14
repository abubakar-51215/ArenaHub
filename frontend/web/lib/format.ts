/** Display formatting shared by the owner dashboard screens — matches the
 * wireframe conventions ("Rs. 245,780", "7:00 PM", "7 PM – 10 PM", "May 18, 2024"). */

/** "2500.00" → "Rs. 2,500" (decimals kept only when non-zero). */
export function formatRs(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return `Rs. ${value}`;
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return `Rs. ${n.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** "19:00:00" → "7:00 PM". */
export function formatTime(hms: string): string {
  const [h, m] = hms.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** 19 → "7 PM" (24 wraps to "12 AM"). */
export function formatHour(hour: number): string {
  const h = hour % 24;
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12} ${period}`;
}

/** "2026-07-14" → "Jul 14, 2026" (local-safe: parsed as date parts, not UTC). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "2026-07-14" → "Jul 14" for chart axes and compact lists. */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Date → "2026-07-14" in local time (for <input type="date"> and API params). */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compact axis ticks: 245780 → "246K". */
export function compactNumber(n: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
