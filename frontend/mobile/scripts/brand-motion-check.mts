// Numbers for the logo motion: the hero timeline key times, the ball-pick rule, loader laps.
// Run: node --experimental-strip-types scripts/brand-motion-check.mts
import * as m from '../lib/brand-motion.ts';
import { BALL_KEYS } from '../constants/brand-faces.generated.ts';

console.log('hero path total', m.HERO_PATH.total.toFixed(2), '| 63/total =', ((63 / m.HERO_PATH.total) * 100).toFixed(3), '% (file: 11.997)');
console.log('ball at 21.268%:', m.pointAt(m.HERO_PATH, 21.268).map((v) => v.toFixed(1)).join(','), '| at 89.527%:', m.pointAt(m.HERO_PATH, 89.527).map((v) => v.toFixed(1)).join(','), '| at 100%:', m.pointAt(m.HERO_PATH, 100).map((v) => v.toFixed(1)).join(','));
console.log('key times 1x (ms):', JSON.stringify(m.keyTimesMs(1)));
console.log('key times 2x (ms):', JSON.stringify(m.keyTimesMs(2)));

// 100 plays: the 4th ball never repeats the previous play's 4th; the four are distinct
let last: (typeof BALL_KEYS)[number] | null = null;
let repeats = 0;
let notDistinct = 0;
for (let i = 0; i < 100; i++) {
  const p = m.pickFour(BALL_KEYS, last);
  if (last !== null && p[3] === last) repeats++;
  if (new Set(p).size !== 4) notDistinct++;
  last = p[3];
}
console.log('100 picks: repeats of the previous final ball =', repeats, '| picks with a repeated ball =', notDistinct);

// loader: 8 distinct balls per cycle, in a random order each time; lap = 1400 ms
const orders = new Set<string>();
let allDistinct = 0;
for (let i = 0; i < 50; i++) {
  const o = m.shuffled(BALL_KEYS);
  if (new Set(o).size === 8) allDistinct++;
  orders.add(o.join());
}
console.log('loader: lap', m.LAP_MS, 'ms | cycle', m.LAP_MS * 8, 'ms | cycles with 8 distinct balls', allDistinct, 'of 50 | different orders seen', orders.size, 'of 50');
