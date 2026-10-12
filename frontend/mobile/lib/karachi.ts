/**
 * Dates and "today" in Asia/Karachi (UTC+5, no daylight saving), whatever time zone the phone is set to. Every screen
 * that needs "today", a day strip, "is this in the past" or a notice's day uses these (rule: docs/MOBILE_QA_GATE.md
 * "Dates"). A fixed +5 h offset is used on purpose (Pakistan has had no daylight saving since 2009), so nothing depends
 * on the phone's Intl support. Tested with `node scripts/karachi-check.cjs` under several TZ settings.
 */
const OFFSET_MS = 5 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A time from the server as a Date. Most arrive with a "Z" (UTC); some (reviews, arena dates) have no zone and are the
 * server's own wall clock, which is Karachi time, so those are read as Karachi time (never as the phone's).
 */
export function parseTs(v: Date | string | number): Date {
  if (typeof v !== 'string') return new Date(v);
  if (/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(v)) return new Date(v);
  return new Date(`${v.trim().replace(' ', 'T')}+05:00`);
}

/** A moment as Karachi wall-clock fields. */
export function karachiParts(at: Date | string | number = new Date()) {
  const t = parseTs(at);
  const k = new Date(t.getTime() + OFFSET_MS);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    hour: k.getUTCHours(),
    minute: k.getUTCMinutes(),
    dow: k.getUTCDay(),
  };
}

/** "YYYY-MM-DD" of a moment, in Karachi. */
export function karachiDate(at: Date | string | number = new Date()): string {
  const p = karachiParts(at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Today in Karachi. */
export const karachiToday = (now: Date = new Date()): string => karachiDate(now);

/** Minutes since midnight in Karachi. */
export function karachiMinutes(now: Date = new Date()): number {
  const p = karachiParts(now);
  return p.hour * 60 + p.minute;
}

const toUtcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** `iso` plus `n` days (calendar days, no clock involved). */
export function addDays(iso: string, n: number): string {
  const t = new Date(toUtcDay(iso) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Whole days from `a` to `b` (b minus a). */
export const dayDiff = (a: string, b: string): number => Math.round((toUtcDay(b) - toUtcDay(a)) / 86400000);

/** 0 = Sunday, for a "YYYY-MM-DD" day. */
export const weekdayOf = (iso: string): number => new Date(toUtcDay(iso)).getUTCDay();

/** Has a booking that starts on `isoDate` at `hhmm` ("18:00" or "18:00:00", Karachi time) already started? */
export function hasStarted(isoDate: string, hhmm: string, now: Date = new Date()): boolean {
  const today = karachiToday(now);
  if (isoDate !== today) return isoDate < today;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m <= karachiMinutes(now);
}

/** "Thu 22 May". */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(iso)]} ${d} ${MONTHS[m - 1]}`;
}

/** "Thursday" for a "YYYY-MM-DD" day. */
export const weekdayName = (iso: string): string => WEEKDAYS_LONG[weekdayOf(iso)];

/** "Thursday 22 May" (the long form used by the slot day names). */
export function formatDayLong(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS_LONG[weekdayOf(iso)]} ${d} ${MONTHS_LONG[m - 1]}`;
}

/** "22 May", or "22 May 2025" when it is not this year (Karachi). The one format for review dates. */
export function formatDate(at: Date | string, now: Date = new Date()): string {
  const p = karachiParts(at);
  const base = `${p.day} ${MONTHS[p.month - 1]}`;
  return p.year === karachiParts(now).year ? base : `${base} ${p.year}`;
}

/** "6:00 PM" from "18:00" or "18:00:00". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** For a review: "Just now", "5 min ago", "3 hours ago", "1 day ago", "2 weeks ago", else the date. */
export function timeAgo(at: Date | string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - parseTs(at).getTime()) / 1000));
  if (secs < 60) return 'Just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${plural(Math.floor(secs / 3600), 'hour')} ago`;
  const days = Math.floor(secs / 86400);
  if (days < 7) return `${plural(days, 'day')} ago`;
  if (days < 35) return `${plural(Math.floor(days / 7), 'week')} ago`;
  return formatDate(at, now);
}

/** For a notice: "now", "5 m", "2 h", "1 d". */
export function shortAgo(at: Date | string, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - parseTs(at).getTime()) / 1000));
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)} m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h`;
  return `${Math.floor(secs / 86400)} d`;
}

/** Which group a moment belongs to in the Notifications list: by the Karachi calendar day. */
export function dayGroup(at: Date | string, now: Date = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const diff = dayDiff(karachiDate(at), karachiToday(now));
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : 'Earlier';
}

/** The next `count` days from today in Karachi, for a day strip. */
export function dayStrip(count: number, now: Date = new Date()) {
  const today = karachiToday(now);
  return Array.from({ length: count }, (_, i) => {
    const iso = addDays(today, i);
    const [, m, d] = iso.split('-').map(Number);
    return { iso, weekday: WEEKDAYS[weekdayOf(iso)], num: d, month: MONTHS[m - 1], dow: weekdayOf(iso) };
  });
}
