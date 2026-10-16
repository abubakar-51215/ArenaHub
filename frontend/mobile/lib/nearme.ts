/**
 * The "Find arenas near you" pop-up rule. It is shown when the app is opened, unless location is already allowed, and not
 * twice on the same calendar day (Asia/Karachi): after "Not now" (or a refusal) it comes back on the next day the app is
 * opened, and every day after that until location is allowed. Only the DATE of the last "Not now" is stored (in the
 * app's own storage, never on the server, never any coordinates).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { karachiToday } from '@/lib/karachi';

const KEY = 'arenahub-nearme-not-now';

/** Pure rule: should the pop-up show now? `lastNotNow` is the Karachi date ("YYYY-MM-DD") of the last "Not now", or null. */
export function promptDue(opts: { granted: boolean; lastNotNow: string | null; today: string }): boolean {
  if (opts.granted) return false;
  return opts.lastNotNow !== opts.today;
}

export async function readLastNotNow(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Remember "Not now" for today (Karachi date). */
export async function rememberNotNow(now: Date = new Date()): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, karachiToday(now));
  } catch {
    // nothing to do: the pop-up may show once more today
  }
}
