// The motion of the ArenaHub mark, transcribed from the CSS keyframes in
// design/brand/arenahub-logo.html (the source of truth). Pure functions only, so the same
// code runs in a Reanimated worklet and in a plain Node check. Percentages are of the 7.2 s
// hero timeline.

export const HERO_MS = 7200; // the full hero timeline at 1x, as in the file (--T: 7.2s)
export const LAP_MS = 1400; // one lap of the loader

/** A keyframe: [percent, value, easing of the interval that starts here]. */
export type Ease = readonly [number, number, number, number];
export type Stop = readonly [number, number] | readonly [number, number, Ease];

export const LIN: Ease = [0, 0, 1, 1];
export const EASE_OUT: Ease = [0, 0, 0.58, 1];
export const EASE_IN_OUT: Ease = [0.42, 0, 0.58, 1];

/** cubic-bezier(x1, y1, x2, y2) at progress x (0..1): the CSS timing function. */
export function bezier(e: Ease, x: number): number {
  'worklet';
  const [x1, y1, x2, y2] = e;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const xt = ((ax * t + bx) * t + cx) * t - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(xt) < 1e-6) break;
    if (Math.abs(d) < 1e-6) break;
    t -= xt / d;
  }
  t = Math.min(1, Math.max(0, t));
  return ((ay * t + by) * t + cy) * t;
}

/** The value of a property at `p` percent, from its keyframes (linear unless a stop names an easing). */
export function kf(p: number, stops: readonly Stop[]): number {
  'worklet';
  if (p <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (p >= a[0] && p < b[0]) {
      const span = b[0] - a[0];
      if (span <= 0) return b[1];
      const ease: Ease = (a.length === 3 ? a[2] : LIN) as Ease;
      return a[1] + (b[1] - a[1]) * bezier(ease, (p - a[0]) / span);
    }
  }
  return stops[stops.length - 1][1];
}

const B_RK_IN: Ease = [0.3, 1.35, 0.5, 1];

// ---- ring, runner, trail (stroke-dashoffset in pathLength units: 240 for the ring, 100 for the trail)
export const TRACK_OFFSET: Stop[] = [[0, 240, [0.6, 0, 0.2, 1]], [8, 0], [100, 0]];
export const TRACK_OPACITY: Stop[] = [[0, 0.36], [68, 0.36], [69, 0.95], [80, 0.36], [100, 0.36]];
export const GLINT_OFFSET: Stop[] = [[0, 0], [68, 0, [0.3, 0.5, 0.4, 1]], [79, -240], [100, -240]];
export const GLINT_OPACITY: Stop[] = [[0, 0], [68, 0], [68.5, 1], [76, 0.9], [79, 0], [100, 0]];
export const TRAIL_OFFSET: Stop[] = [[0, 14], [26, 14], [62, -86], [100, -86]];
export const TRAIL_OPACITY: Stop[] = [[0, 0], [25.9, 0], [26, 0.9], [62, 0.9], [66, 0], [100, 0]];

// ---- racket and bat: rotation (deg), drop (px) and opacity
export const RK_ROT: Stop[] = [
  [0, 0, B_RK_IN], [3, 0, B_RK_IN], [11, 24, EASE_OUT], [24.5, 24, EASE_OUT], [26, 34, EASE_IN_OUT],
  [28.5, 24, EASE_OUT], [53.3, 24, EASE_OUT], [54.8, 34, EASE_IN_OUT], [57.3, 24], [68, 24], [69, 19], [71, 26],
  [73, 24, EASE_IN_OUT], [80, 24, EASE_IN_OUT], [84.5, 26.5, EASE_IN_OUT], [89, 22.5, EASE_IN_OUT], [93, 24], [100, 24],
];
export const RK_DROP: Stop[] = [[0, -6, B_RK_IN], [3, -6, B_RK_IN], [11, 0, EASE_OUT], [100, 0]];
export const RK_OPACITY: Stop[] = [[0, 0], [3, 0], [6, 1], [100, 1]];
export const BT_ROT: Stop[] = [
  [0, 0, B_RK_IN], [4, 0, B_RK_IN], [12, -24, [0.4, 0, 0.6, 1]], [17.5, -24, [0.4, 0, 0.6, 1]],
  [20.8, -46, [0.7, 0, 0.95, 0.5]], [21.8, -6, [0.2, 0.8, 0.3, 1]], [24.5, -28, EASE_IN_OUT],
  [26.5, -24, EASE_OUT], [38.9, -24, EASE_OUT], [40.4, -34, EASE_IN_OUT], [42.9, -24], [68, -24], [69, -19], [71, -26],
  [73, -24, EASE_IN_OUT], [80, -24, EASE_IN_OUT], [84.5, -21.5, EASE_IN_OUT], [89, -25.5, EASE_IN_OUT], [93, -24], [100, -24],
];
export const BT_DROP: Stop[] = [[0, -6, B_RK_IN], [4, -6, B_RK_IN], [12, 0, [0.4, 0, 0.6, 1]], [100, 0]];
export const BT_OPACITY: Stop[] = [[0, 0], [4, 0], [7, 1], [100, 1]];

// ---- the ball: distance along its path (percent of the path), visibility, ghosts, squash, spin, faces
export const BALL_DIST: Stop[] = [
  [0, 0, [0.55, 0, 0.9, 0.5]], [10, 0, [0.55, 0, 0.9, 0.5]], [14, 11.997, [0.15, 0.75, 0.4, 1]],
  [22, 11.997, [0.15, 0.75, 0.4, 1]], [26, 21.268], [62, 89.527, [0.5, 0, 0.9, 0.55]], [68, 100], [100, 100],
];
export const BALL_SHOW: Stop[] = [[0, 0], [9.9, 0], [10, 1], [100, 1]];
export const GHOST_DELAY_PCT = [0.045 / 7.2 * 100, 0.09 / 7.2 * 100]; // .gh.g1 and .gh.g2 start .045 s and .09 s later
export const GHOST_OPACITY = [0.42, 0.2];
export const ghostStops = (go: number): Stop[] => [[0, 0], [22, 0], [22.6, go], [65.5, go], [67.5, 0], [100, 0]];
const SQ = (list: [number, number, number][]): [Stop[], Stop[]] => [
  list.map(([p, x]) => [p, x, EASE_IN_OUT] as Stop),
  list.map(([p, , y]) => [p, y, EASE_IN_OUT] as Stop),
];
export const [SQ_X, SQ_Y] = SQ([
  [0, 1, 1], [11, 1, 1], [13, 0.88, 1.14], [14, 1.3, 0.7], [15.5, 0.92, 1.08], [17, 1, 1], [21.7, 1, 1],
  [22.2, 0.7, 1.22], [23.5, 1.06, 0.95], [24.5, 1, 1], [25.6, 1, 1], [26.3, 1.22, 1.22], [27.5, 1, 1], [40, 1, 1],
  [40.7, 1.22, 1.22], [42, 1, 1], [54.4, 1, 1], [55.1, 1.22, 1.22], [56.4, 1, 1], [63, 1, 1], [66.5, 0.88, 1.14],
  [68, 1.32, 0.68], [69.5, 0.93, 1.07], [71, 1, 1], [100, 1, 1],
]);
export const SPIN: Stop[] = [[0, 0, [0.2, 0.6, 0.4, 1]], [22, 0, [0.2, 0.6, 0.4, 1]], [68, 1260], [100, 1260]];
/** which of the four balls shows (hF1 to hF4): [start percent, end percent] of each one's visible time */
export const FACE_WINDOWS: readonly [number, number][] = [[0, 26], [26, 40.4], [40.4, 54.8], [54.8, 100]];
export const faceOpacity = (p: number, i: number): number => {
  'worklet';
  const [a, b] = FACE_WINDOWS[i];
  return p >= a && p < b ? 1 : 0;
};

// ---- impact and landing
export const BURST_OPACITY: Stop[] = [[0, 0], [21.6, 0], [21.9, 1], [25, 0], [100, 0]];
export const BURST_SCALE: Stop[] = [[0, 0.6], [21.6, 0.6], [21.9, 1, EASE_OUT], [25, 1.4], [100, 1.4]];
export const SPARK_OPACITY: Stop[] = [[0, 0], [21.7, 0], [21.9, 1], [26, 0], [100, 0]];
export const SPARK_MOVE: Stop[] = [[0, 0], [21.9, 0, [0.2, 0.7, 0.3, 1]], [26, 1], [100, 1]];
export const SPARK_SCALE: Stop[] = [[0, 1], [21.9, 1], [26, 0.4], [100, 0.4]];
export const DOT_OPACITY: Stop[] = [[0, 0], [67.9, 0], [68.2, 1], [77, 0], [100, 0]];
export const DOT_MOVE: Stop[] = [[0, 0], [68.2, 0, [0.2, 0.7, 0.3, 1]], [77, 1], [100, 1]];
export const DOT_SCALE: Stop[] = [[0, 1], [68.2, 1], [77, 0.3], [100, 0.3]];
export const PULSE_OPACITY: Stop[] = [[0, 0], [67.9, 0], [68, 0.85], [78, 0], [100, 0]];
export const PULSE_SCALE: Stop[] = [[0, 1], [68, 1, [0.2, 0.6, 0.3, 1]], [78, 3.6], [100, 3.6]];
export const SHOCK_OPACITY: Stop[] = [[0, 0], [68, 0], [68.3, 0.35], [82, 0], [100, 0]];
export const SHOCK_SCALE: Stop[] = [[0, 0.5], [68, 0.5], [68.3, 0.5, [0.2, 0.6, 0.3, 1]], [82, 4], [100, 4]];
export const SHAKE_X: Stop[] = [[0, 0], [21.7, 0], [22, 1.2], [22.6, -1], [23.2, 0.6], [23.8, 0], [100, 0]];
export const SHAKE_Y: Stop[] = [[0, 0], [67.9, 0], [68.3, 1.6], [69, -1], [69.6, 0.5], [70.2, 0], [100, 0]];

// ---- wordmark and tagline
export const WORD_WRAP: Stop[] = [[0, 0], [69.9, 0], [70, 1], [100, 1]];
export const LETTER_OPACITY: Stop[] = [[0, 0], [71, 0], [77, 1], [100, 1]];
export const LETTER_RISE: Stop[] = [[0, 22], [71, 22, [0.2, 0.75, 0.3, 1]], [77, 0], [100, 0]];
export const LETTER_SCALE: Stop[] = [[0, 0.96], [71, 0.96, [0.2, 0.75, 0.3, 1]], [77, 1], [100, 1]];
export const LETTER_DELAY_PCT = (0.045 / 7.2) * 100; // each letter 45 ms after the one before
export const TAG_OPACITY: Stop[] = [[0, 0], [76, 0], [82, 1], [100, 1]];
export const TAG_RISE: Stop[] = [[0, 8], [76, 8, [0.2, 0.75, 0.3, 1]], [82, 0], [100, 0]];

/** The ball lands in the middle at this percent of the timeline. */
export const LAND_PCT = 68;

// ---- key times (ms) of the timeline at a speed: what the check lists
export function keyTimesMs(speed: number): Record<string, number> {
  const ms = (p: number) => Math.round((p / 100) * (HERO_MS / speed));
  return {
    'ring draws (end)': ms(8),
    'racket + bat in (end)': ms(12),
    'cricket ball drops': ms(10),
    'bat hits': ms(21.8),
    'racket taps onto the ring': ms(26),
    'tennis to basketball': ms(40.4),
    'basketball to football': ms(54.8),
    'ball lands': ms(LAND_PCT),
    'wordmark starts': ms(70),
    'wordmark + tagline done': ms(82),
    'whole timeline': ms(100),
  };
}

// ---- the ball path (offset-path of the hero ball), sampled once
const R = 38;
type Seg = { len: number; at: (u: number) => [number, number] };
const line = (x1: number, y1: number, x2: number, y2: number): Seg => ({
  len: Math.hypot(x2 - x1, y2 - y1),
  at: (u) => [x1 + (x2 - x1) * u, y1 + (y2 - y1) * u],
});
// quarter corner, clockwise (SVG sweep 1) around the centre (cx, cy) from angle a1 to a2 (degrees)
const arc = (cx: number, cy: number, a1: number, a2: number): Seg => ({
  len: (Math.PI / 2) * R,
  at: (u) => {
    const a = ((a1 + (a2 - a1) * u) * Math.PI) / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  },
});
const quad = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Seg => {
  const at = (u: number): [number, number] => [(1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * cy + u * u * y1];
  let len = 0;
  let prev = at(0);
  for (let i = 1; i <= 40; i++) {
    const q = at(i / 40);
    len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
  }
  return { len, at };
};

/** hero ball: M60 8 V71 Q34 72 14 58 V54 A38 38 0 0 1 52 16 H68 A... (two laps) ... H60 V71 */
const HERO_SEGS: Seg[] = [
  line(60, 8, 60, 71), quad(60, 71, 34, 72, 14, 58), line(14, 58, 14, 54), arc(52, 54, 180, 270), line(52, 16, 68, 16),
  arc(68, 54, 270, 360), line(106, 54, 106, 62), arc(68, 62, 0, 90), line(68, 100, 52, 100), arc(52, 62, 90, 180),
  line(14, 62, 14, 54), arc(52, 54, 180, 270), line(52, 16, 60, 16), line(60, 16, 60, 71),
];
/** loader ball: one lap from the left side of the ring and back to it */
const LOOP_SEGS: Seg[] = [
  line(14, 58, 14, 54), arc(52, 54, 180, 270), line(52, 16, 68, 16), arc(68, 54, 270, 360), line(106, 54, 106, 62),
  arc(68, 62, 0, 90), line(68, 100, 52, 100), arc(52, 62, 90, 180), line(14, 62, 14, 58),
];

function table(segs: Seg[], steps = 360): { xs: number[]; ys: number[]; total: number } {
  const total = segs.reduce((s, g) => s + g.len, 0);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= steps; i++) {
    let d = (i / steps) * total;
    let pt: [number, number] = segs[0].at(0);
    for (const g of segs) {
      if (d <= g.len || g === segs[segs.length - 1]) {
        pt = g.at(Math.min(1, Math.max(0, d / g.len)));
        break;
      }
      d -= g.len;
    }
    xs.push(pt[0]);
    ys.push(pt[1]);
  }
  return { xs, ys, total };
}
export const HERO_PATH = table(HERO_SEGS);
export const LOOP_PATH = table(LOOP_SEGS);

/** The point at `pct` percent of a sampled path. */
export function pointAt(t: { xs: number[]; ys: number[] }, pct: number): [number, number] {
  'worklet';
  const n = t.xs.length - 1;
  const f = Math.min(1, Math.max(0, pct / 100)) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  return [t.xs[i] + (t.xs[i + 1] - t.xs[i]) * u, t.ys[i] + (t.ys[i + 1] - t.ys[i]) * u];
}

// lengths of the drawn ring and trail paths (the file uses pathLength 240 and 100)
export const RING_LEN = 286.76104167282426;
export const TRAIL_LEN = 358.45130209103036;
export const RING2_LEN = RING_LEN * 2;

// ---- the four balls of a hero play: random, and the last never the same as the last play's last
export function pickFour<K extends string>(keys: readonly K[], lastFinal: K | null, rand: () => number = Math.random): K[] {
  const a = keys.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  const p = a.slice(0, 4);
  if (lastFinal !== null && p[3] === lastFinal) {
    const alt = keys.filter((k) => !p.includes(k));
    p[3] = alt[0];
  }
  return p;
}

/** All eight in a random order (the loader: one ball per lap). */
export function shuffled<K>(keys: readonly K[], rand: () => number = Math.random): K[] {
  const a = keys.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
