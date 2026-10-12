import type { OperatingHours, TimeSlot } from '@/types';

import { karachiMinutes, karachiParts } from '@/lib/karachi';
/** "18:00:00" -> "6 PM", "18:30" -> "6:30 PM". */
export function hourLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * "Open till 11 PM": today's closing time, worked out on the phone from the
 * arena's opening hours. Null when the arena is closed today (the tag is then
 * left out) or has no hours.
 */
export function openTillLabel(hours: OperatingHours | undefined, now: Date = new Date()): string | null {
  const today = hours?.[WEEKDAYS[karachiParts(now).dow]];
  if (!today?.close) return null;
  return `Open till ${hourLabel(today.close)}`;
}

export type SlotKind = 'open' | 'cheaper' | 'peak';

/** Below the court's base price is the light-green "cheaper" look; above it is peak. */
export function slotKind(price: number, base: number): SlotKind {
  if (base > 0 && price < base) return 'cheaper';
  if (base > 0 && price > base) return 'peak';
  return 'open';
}

export interface SlotGroup {
  key: 'morning' | 'afternoon' | 'evening';
  label: string;
  slots: TimeSlot[];
}

/**
 * Morning (before 12), Afternoon (12 to 5 PM) and Evening (5 PM on); a group
 * with nothing in it is left out. The label says "cheaper" or "peak" when its
 * slots are priced below or above the court's base price.
 */
export function groupSlots(slots: TimeSlot[], base: number): SlotGroup[] {
  const defs: { key: SlotGroup['key']; name: string; test: (h: number) => boolean }[] = [
    { key: 'morning', name: 'Morning', test: (h) => h < 12 },
    { key: 'afternoon', name: 'Afternoon', test: (h) => h >= 12 && h < 17 },
    { key: 'evening', name: 'Evening', test: (h) => h >= 17 },
  ];
  return defs
    .map((d) => {
      const inGroup = slots.filter((s) => d.test(Number(s.start_time.slice(0, 2))));
      const kinds = inGroup.map((s) => slotKind(Number(s.price), base));
      const suffix = kinds.includes('cheaper') && !kinds.includes('peak') ? ' · cheaper' : kinds.includes('peak') ? ' · peak' : '';
      return { key: d.key, label: d.name + suffix, slots: inGroup };
    })
    .filter((g) => g.slots.length > 0);
}

/** Today's slots that have already started are hidden. `date` is YYYY-MM-DD. */
export function hidePast(slots: TimeSlot[], todayIso: string, now: Date = new Date()): TimeSlot[] {
  const minutes = karachiMinutes(now);
  return slots.filter((s) => {
    if (s.date !== todayIso) return true;
    const [h, m] = s.start_time.split(':').map(Number);
    return h * 60 + m > minutes;
  });
}

const key = (s: TimeSlot) => s.start_time.slice(0, 5);

/** Whether `next` starts exactly when `prev` ends. */
const adjacent = (prev: TimeSlot, next: TimeSlot) => prev.end_time.slice(0, 5) === next.start_time.slice(0, 5);

/**
 * What a tap on `slot` does to the selection (ids, in time order): tapping next
 * to the chosen block grows it ("tap more times next to each other to play
 * longer"); tapping a chosen end takes it off; tapping inside a block keeps
 * the part before it; tapping anywhere else starts a new block. At most `max`.
 */
export function toggleSlot(selected: TimeSlot[], slot: TimeSlot, max: number): TimeSlot[] {
  const sorted = [...selected].sort((a, b) => key(a).localeCompare(key(b)));
  const at = sorted.findIndex((s) => s.id === slot.id);
  if (at >= 0) return sorted.slice(0, at);
  if (sorted.length === 0) return [slot];
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (adjacent(last, slot) && sorted.length < max) return [...sorted, slot];
  if (adjacent(slot, first) && sorted.length < max) return [slot, ...sorted];
  return [slot];
}

/** "Thu 22 May · 6–8 PM · 2 hrs" for the sticky bar (the times as a list if they are not in one block). */
export function rangeLabel(dayLabel: string, selected: TimeSlot[]): string {
  const sorted = [...selected].sort((a, b) => key(a).localeCompare(key(b)));
  if (sorted.length === 0) return 'Choose a time';
  const block = sorted.every((s, i) => i === 0 || adjacent(sorted[i - 1], s));
  const hrs = `${sorted.length} ${sorted.length === 1 ? 'hr' : 'hrs'}`;
  if (!block) return `${dayLabel} · ${sorted.map((s) => hourLabel(s.start_time)).join(', ')} · ${hrs}`;
  const start = hourLabel(sorted[0].start_time);
  const end = hourLabel(sorted[sorted.length - 1].end_time);
  const [sh, ssuf] = start.split(' ');
  const [, esuf] = end.split(' ');
  // "6–8 PM" when both ends share AM/PM, else "11 AM – 1 PM"
  const range = ssuf === esuf ? `${sh}–${end}` : `${start} – ${end}`;
  return `${dayLabel} · ${range} · ${hrs}`;
}
