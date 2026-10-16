import { BALL_KEYS, type BallKey } from '@/constants/brand-faces.generated';
import * as M from '@/lib/brand-motion';

// Shared by the native and the web ArenaHub mark.
export type BrandMode = 'still' | 'hero' | 'loader' | 'success' | 'offline';
export type BrandTone = 'dark' | 'light';
export type { BallKey };

export const PAL = {
  dark: { mk: '#C4F546', ac: '#C4F546', hole: '#0F1A15', spk: '#F3F7EF', ring: '#C4F546', ringFaint: 'rgba(196,245,70,.36)', run: '#C4F546', wd: '#F3F7EF', tg: '#8FA096', foot: '#FFFFFF' },
  light: { mk: '#0F1A15', ac: '#7FA30F', hole: '#F1F2EF', spk: '#0F1A15', ring: '#0F1A15', ringFaint: 'rgba(15,26,21,.26)', run: '#7FA30F', wd: '#0F1A15', tg: '#59665F', foot: '#C4F546' },
} as const;

export interface BrandMarkProps {
  mode?: BrandMode;
  tone?: BrandTone;
  /** the ball of a still mark (football by default; icons always use the football) */
  ball?: BallKey;
  /** width in px of the mark (hero: the mark, with the wordmark and tagline below it) */
  size?: number;
  speed?: number;
  balls?: BallKey[];
  onLand?: () => void;
  onSettled?: () => void;
  onDone?: () => void;
  withWord?: boolean;
}

const lastFinal: { value: BallKey | null } = { value: null };
/** Four balls for one hero play: random, and the last one never the same as the previous play's last. */
export function pickHeroBalls(): BallKey[] {
  const four = M.pickFour(BALL_KEYS, lastFinal.value);
  lastFinal.value = four[3];
  return four;
}
