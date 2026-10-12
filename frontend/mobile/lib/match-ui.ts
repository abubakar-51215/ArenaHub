import { formatClock, formatDayShort } from '@/lib/karachi';
import { formatRs } from '@/lib/money';
import { sportLabel } from '@/constants/sports';
import type { Match } from '@/types';

/** "Thu 22 May · 6:00 – 7:00 PM" (Karachi times as the server stored them). */
export const matchWhen = (m: Pick<Match, 'match_date' | 'start_time' | 'end_time'>): string =>
  `${formatDayShort(m.match_date)} · ${formatClock(m.start_time)} – ${formatClock(m.end_time)}`;

/** "about ₨ 240 each": the booking's total divided by all the players. Text only: nothing is paid in the app. */
export function priceEach(total: string | number | null | undefined, players: number): string | null {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0 || players < 1) return null;
  return `about ${formatRs(Math.round(t / players))} each`;
}

/** "Futsal · Gulberg III" (the arena's area is not on a match: it shows the arena name). */
export const matchTitle = (m: Pick<Match, 'sport' | 'arena_name'>): string => `${sportLabel(m.sport)} · ${m.arena_name}`;

export type MatchLook = { label: string; tone: 'ok' | 'wait' | 'off' | 'idle' };

/** The pill on a match: what the match is to me. */
export function matchPill(m: Pick<Match, 'status' | 'creator_id' | 'joined_by_me'>, myId: string | undefined): MatchLook {
  if (m.status === 'cancelled') return { label: 'Cancelled', tone: 'off' };
  if (m.status === 'completed') return { label: 'Finished', tone: 'idle' };
  if (m.creator_id === myId) return { label: 'You posted', tone: 'ok' };
  if (m.joined_by_me) return { label: 'You joined', tone: 'ok' };
  if (m.status === 'full') return { label: 'Full', tone: 'idle' };
  return { label: 'Open', tone: 'ok' };
}
