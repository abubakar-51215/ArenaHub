import { asClock } from '@/lib/karachi';

/** A slot as Pick a slot passes it on. */
export interface SelectedSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  price: string;
}

export function parseSlots(param: string | undefined): SelectedSlot[] {
  try {
    const list = JSON.parse(param ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function parseEquipment(param: string | undefined): Record<string, number> {
  try {
    const obj = JSON.parse(param ?? '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseIso(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

/** "Thursday, 22 May 2026" */
export function longDate(iso: string): string {
  const { y, m, d, dow } = parseIso(iso);
  return `${DAYS[dow]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Thursday, 22 May" */
export function dayAndMonth(iso: string): string {
  const { m, d, dow } = parseIso(iso);
  return `${DAYS[dow]}, ${d} ${MONTHS[m - 1]}`;
}

/** "Thu 22 May" */
export function shortDate(iso: string): string {
  const { m, d, dow } = parseIso(iso);
  return `${DAYS[dow].slice(0, 3)} ${d} ${MONTHS[m - 1].slice(0, 3)}`;
}

function clock(time: string): { text: string; suffix: string } {
  const [h, m] = asClock(time).split(':').map(Number);
  return { text: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`, suffix: h >= 12 ? 'PM' : 'AM' };
}

/** "6:00 – 8:00 PM" (or "11:00 AM – 1:00 PM" across noon) */
export function timeRange(start: string, end: string): string {
  const a = clock(start);
  const b = clock(end);
  return a.suffix === b.suffix ? `${a.text} – ${b.text} ${b.suffix}` : `${a.text} ${a.suffix} – ${b.text} ${b.suffix}`;
}

/** "6:00 PM" */
export function clockLabel(time: string): string {
  const c = clock(time);
  return `${c.text} ${c.suffix}`;
}

export function hoursLabel(count: number): string {
  return `${count} ${count === 1 ? 'hour' : 'hours'}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar file (.ics) for a booking: local times, no time zone, a one hour reminder. */
export function buildIcs(opts: { code: string; title: string; place: string; date: string; start: string; end: string }): string {
  const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.slice(0, 2)}${time.slice(3, 5)}00`;
  const now = new Date();
  const created = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ArenaHub//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${opts.code}@arenahub`,
    `DTSTAMP:${created}`,
    `DTSTART:${stamp(opts.date, opts.start)}`,
    `DTEND:${stamp(opts.date, opts.end)}`,
    `SUMMARY:${opts.title}`,
    `LOCATION:${opts.place}`,
    `DESCRIPTION:Booking ${opts.code}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your game starts in one hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** "6–8 PM" (or "11 AM – 1 PM" across noon) from "18:00:00" and "20:00:00". */
export function compactRange(start: string, end: string): string {
  const f = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return { n: `${h % 12 === 0 ? 12 : h % 12}${m ? ':' + String(m).padStart(2, '0') : ''}`, s: h >= 12 ? 'PM' : 'AM' };
  };
  const a = f(start);
  const b = f(end);
  return a.s === b.s ? `${a.n}–${b.n} ${b.s}` : `${a.n} ${a.s} – ${b.n} ${b.s}`;
}
