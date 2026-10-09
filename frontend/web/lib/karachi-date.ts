/**
 * Calendar dates as "YYYY-MM-DD" strings in Asia/Karachi time, which is the
 * time the arenas keep (bookings are stored as dates in it). All arithmetic
 * is on the date's own parts (UTC), so the browser's time zone and daylight
 * saving never shift a day.
 */
const ZONE = "Asia/Karachi";

/** Today's date in Karachi. */
export function karachiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
}

/** Minutes since midnight in Karachi right now. */
export function karachiMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The date `days` after (or before, when negative) `iso`. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return fromUtc(Date.UTC(y, m - 1, d + days));
}

/** The first day of the month `months` after `iso`'s month. */
export function addMonthsIso(iso: string, months: number): string {
  const [y, m] = parts(iso);
  return fromUtc(Date.UTC(y, m - 1 + months, 1));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(`${iso}T00:00:00Z`));

/** "Fri 9 Oct 2026". */
export function longDay(iso: string): string {
  return fmt(iso, { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
}

/** "Today · Fri 9 Oct 2026", "Tomorrow · …", "Yesterday · …", or just the weekday and date. */
export function dayLabel(iso: string, today: string): string {
  const base = longDay(iso);
  if (iso === today) return `Today · ${base}`;
  if (iso === addDaysIso(today, 1)) return `Tomorrow · ${base}`;
  if (iso === addDaysIso(today, -1)) return `Yesterday · ${base}`;
  return base;
}

/** "October 2026". */
export function monthTitle(iso: string): string {
  return fmt(iso, { month: "long", year: "numeric" });
}

/** The 6 x 7 grid of dates (Sunday first) that shows `iso`'s month. */
export function monthGrid(iso: string): string[] {
  const first = addMonthsIso(iso, 0);
  const start = addDaysIso(first, -weekdayIndex(first));
  return Array.from({ length: 42 }, (_, i) => addDaysIso(start, i));
}
