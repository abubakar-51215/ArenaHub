import { sportLabel } from '@/constants/sports';
import type { AdminArenaCard } from '@/services/admin';
import { dotJoin } from '@/lib/text';

/** "Lahore, Gulberg III · Futsal, Cricket" (sports as the app names them). */
export const arenaSub = (a: Pick<AdminArenaCard, 'city' | 'area' | 'sports_offered'>) =>
  dotJoin([`${a.city}${a.area ? `, ${a.area}` : ''}`, a.sports_offered.map(sportLabel).join(', ') || 'No sport yet']);

export const HANDLED = 'Someone already handled this arena.';
