import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { BALL_FACES, BALL_KEYS } from '@/constants/brand-faces.generated';
import { Font } from '@/constants/theme';
import { PAL, pickHeroBalls, type BallKey, type BrandMarkProps, type BrandMode, type BrandTone } from '@/components/brand/brand-shared';
import {
  BALL_DIST,
  BALL_SHOW,
  BT_DROP,
  BT_OPACITY,
  BT_ROT,
  BURST_OPACITY,
  BURST_SCALE,
  DOT_MOVE,
  DOT_OPACITY,
  DOT_SCALE,
  GHOST_DELAY_PCT,
  GHOST_STOPS,
  GLINT_OFFSET,
  GLINT_OPACITY,
  HERO_MS,
  HERO_PATH,
  LAND_PCT,
  LAP_MS,
  LETTER_DELAY_PCT,
  LETTER_OPACITY,
  LETTER_RISE,
  LETTER_SCALE,
  LOOP_PATH,
  PULSE_OPACITY,
  PULSE_SCALE,
  RING2_LEN,
  RING_LEN,
  RK_DROP,
  RK_OPACITY,
  RK_ROT,
  SHAKE_X,
  SHAKE_Y,
  SHOCK_OPACITY,
  SHOCK_SCALE,
  SPARK_MOVE,
  SPARK_OPACITY,
  SPARK_SCALE,
  SPIN,
  SQ_X,
  SQ_Y,
  Stop,
  TAG_OPACITY,
  TAG_RISE,
  TRACK_OFFSET,
  TRACK_OPACITY,
  TRAIL_LEN,
  TRAIL_OFFSET,
  TRAIL_OPACITY,
  WORD_WRAP,
  bezier,
  faceOpacity,
  kf,
  pointAt,
  shuffled,
} from '@/lib/brand-motion';
import { tapHaptic } from '@/lib/haptics';

// The ArenaHub mark, drawn from design/brand/arenahub-logo.html (viewBox 0 0 120 120).
//   still    the picture, nothing moves
//   hero     the 7.2 s splash: ring draws, racket and bat swing in, the ball is bowled and hit, laps the
//            ring changing twice, lands in the middle, then the wordmark and tagline come in
//   loader   a lime runner and a ball lap the ring in 1.4 s; a different ball every lap, random order
//   success  the ring lights, the ball lands, once (about 1.1 s), then holds
//   offline  broken ring, grey ball, red slash, slow drift
// "Reduce motion" shows the final picture at once.


// ---- ball faces (strings from the logo file, parsed once into shapes)
type Shape = { tag: 'circle' | 'path'; props: Record<string, string> };
const ATTR: Record<string, string> = { 'stroke-width': 'strokeWidth', 'stroke-dasharray': 'strokeDasharray', 'stroke-linecap': 'strokeLinecap' };
const FACE_SHAPES: Record<BallKey, Shape[]> = Object.fromEntries(
  BALL_KEYS.map((k) => {
    const shapes: Shape[] = [];
    for (const m of BALL_FACES[k].svg.matchAll(/<(circle|path)\s+([^>]*?)\/>/g)) {
      const props: Record<string, string> = {};
      for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) props[ATTR[a[1]] ?? a[1]] = a[2];
      shapes.push({ tag: m[1] as Shape['tag'], props });
    }
    return [k, shapes];
  }),
) as Record<BallKey, Shape[]>;

function Face({ ball, tone, opacity = 1 }: { ball: BallKey; tone: BrandTone; opacity?: number }) {
  return (
    <G opacity={opacity}>
      {FACE_SHAPES[ball].map((s, i) => {
        const props: Record<string, string> = { ...s.props };
        if (ball === 'football' && props.fill === '#FFFFFF' && s.tag === 'circle') props.fill = PAL[tone].foot;
        return s.tag === 'circle' ? <Circle key={i} {...(props as object)} /> : <Path key={i} {...(props as object)} />;
      })}
    </G>
  );
}

const RING_D = 'M52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V54 A38 38 0 0 1 52 16 Z';
const TRAIL_D = 'M14 58 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V54 A38 38 0 0 1 52 16 H60';
const RING2_D = 'M14 58 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V58';
const HOLES: [number, number][] = [[55, 59], [60, 59], [65, 59], [55, 65], [60, 65], [65, 65], [55, 71], [60, 71], [65, 71], [57.5, 77], [62.5, 77]];

function Racket({ c, hole }: { c: string; hole: string }) {
  return (
    <>
      <Rect x={57.4} y={22} width={5.2} height={27} rx={2.6} fill={c} />
      <Path d="M58 44h4M58 40h4" stroke={hole} strokeWidth={1.1} strokeLinecap="round" opacity={0.55} />
      <Rect x={48} y={50} width={24} height={34} rx={12} fill={c} />
      {HOLES.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={1.35} fill={hole} />
      ))}
    </>
  );
}
function Bat({ c, ridge }: { c: string; ridge: string }) {
  return (
    <>
      <Rect x={57.6} y={22} width={4.8} height={28} rx={2.4} fill={c} />
      <Path d="M57.8 29h4.4M57.8 33h4.4M57.8 37h4.4" stroke={ridge} strokeWidth={1} opacity={0.5} />
      <Path d="M53 49 Q60 45 67 49 V84 Q67 90 60 90 Q53 90 53 84 Z" fill={c} />
      <Path d="M60 53 V84" stroke={ridge} strokeWidth={1.3} strokeLinecap="round" opacity={0.35} />
    </>
  );
}

/** The mark at rest: ring, racket and bat, and (unless `noBall`) a ball in the middle. */
function Still({ tone, ball = 'football', noBall, ringColor, ringDash }: { tone: BrandTone; ball?: BallKey; noBall?: boolean; ringColor?: string; ringDash?: boolean }) {
  const p = PAL[tone];
  return (
    <>
      <Path d={RING_D} fill="none" stroke={ringColor ?? p.ringFaint} strokeWidth={3.2} strokeLinecap="round" strokeDasharray={ringDash ? '7 9' : undefined} />
      <G transform="translate(-2.5 0)">
        <G transform="rotate(24 60 24)">
          <Racket c={p.mk} hole={p.hole} />
        </G>
        <G transform="rotate(-24 60 24)">
          <Bat c={p.mk} ridge={p.hole} />
        </G>
      </G>
      {noBall ? null : (
        <G transform="translate(60 71)">
          <Face ball={ball} tone={tone} />
        </G>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the clock
// The marks are drawn on the JavaScript thread: a clock gives the elapsed time about 30 times a second and each frame is
// worked out with plain functions and handed to react-native-svg as ordinary props. There are no worklets here: a worklet
// runs on the UI thread, where an ordinary helper function does not exist (that crashed the splash in Expo Go), and
// react-native-svg's transform props are not reliably animatable from there.
function useClock(durationMs: number, loop: boolean, still: boolean, fps = 30): number {
  const [el, setEl] = useState(still ? durationMs : 0);
  useEffect(() => {
    if (still) {
      setEl(durationMs);
      return;
    }
    let raf = 0;
    let last = 0;
    const start = Date.now();
    const frame = () => {
      const t = Date.now() - start;
      if (!loop && t >= durationMs) {
        setEl(durationMs);
        return;
      }
      if (t - last >= 1000 / fps) {
        last = t;
        setEl(t);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, loop, still, fps]);
  return el;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ------------------------------------------------------------------ hero
const SPARKS: [number, number, 'ac' | 'spk', number][] = [[11, -7, 'ac', 1.3], [13, 2, 'spk', 1.1], [9, 9, 'ac', 1.3], [4, -11, 'spk', 1]];
const DOTS: [number, number, 'ac' | 'spk', number][] = [[18, 0, 'ac', 1.4], [12.7, 10.2, 'spk', 1.1], [0, 14.4, 'ac', 1.4], [-12.7, 10.2, 'spk', 1.1], [-18, 0, 'ac', 1.4], [-12.7, -10.2, 'spk', 1.1], [0, -14.4, 'ac', 1.4], [12.7, -10.2, 'spk', 1.1]];
const WORD = 'ArenaHub'.split('');

function Hero({ tone = 'dark', size = 264, speed = 1, balls, onLand, onSettled, withWord = true }: BrandMarkProps) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const total = HERO_MS / speed;
  const el = useClock(total, false, reduce);
  const p = clamp01(el / total) * 100;
  const four = useMemo(() => balls ?? pickHeroBalls(), [balls]);
  const k = size / 120;

  const landed = useRef(false);
  const settled = useRef(false);
  useEffect(() => {
    if (!landed.current && p >= LAND_PCT) {
      landed.current = true;
      tapHaptic();
      onLand?.();
    }
    if (!settled.current && p >= 82) {
      settled.current = true;
      onSettled?.();
    }
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const [bx, by] = pointAt(HERO_PATH, kf(p, BALL_DIST));
  const ghost = (i: number) => {
    const q = p - GHOST_DELAY_PCT[i];
    const [gx, gy] = pointAt(HERO_PATH, kf(q, BALL_DIST));
    return { x: gx, y: gy, o: kf(q, GHOST_STOPS[i]) };
  };
  const g0 = ghost(0);
  const g1 = ghost(1);
  const pad = 100; // room around the mark for the sparks and the shock ring
  const svgSize = size * ((120 + 2 * pad) / 120);
  const shockR = 27.3 * k;
  const s = size / 264;

  return (
    <View style={styles.lockup}>
      <View style={{ width: size, height: size }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: size / 2 - shockR,
            top: 71 * k - shockR,
            width: shockR * 2,
            height: shockR * 2,
            borderRadius: shockR,
            borderWidth: Math.max(1, 0.9 * k),
            borderColor: pal.ac,
            opacity: kf(p, SHOCK_OPACITY),
            transform: [{ scale: kf(p, SHOCK_SCALE) }],
          }}
        />
        <Svg width={svgSize} height={svgSize} viewBox={`${-pad} ${-pad} ${120 + 2 * pad} ${120 + 2 * pad}`} style={{ position: 'absolute', left: -pad * k, top: -pad * k }} accessibilityRole="image" accessibilityLabel="ArenaHub logo">
          <G transform={`translate(${kf(p, SHAKE_X)} ${kf(p, SHAKE_Y)})`}>
            <Path d={RING_D} fill="none" stroke={pal.ring} strokeWidth={3.2} strokeLinecap="round" strokeDasharray={`${RING_LEN} ${RING_LEN}`} strokeDashoffset={(kf(p, TRACK_OFFSET) / 240) * RING_LEN} strokeOpacity={kf(p, TRACK_OPACITY)} />
            <Path d={RING_D} fill="none" stroke={pal.ac} strokeWidth={4.6} strokeLinecap="round" strokeDasharray={`${(40 / 240) * RING_LEN} ${(400 / 240) * RING_LEN}`} strokeDashoffset={(kf(p, GLINT_OFFSET) / 240) * RING_LEN} strokeOpacity={kf(p, GLINT_OPACITY)} />
            <Path d={TRAIL_D} fill="none" stroke={pal.ac} strokeWidth={4.4} strokeLinecap="round" strokeDasharray={`${(14 / 100) * TRAIL_LEN} ${(300 / 100) * TRAIL_LEN}`} strokeDashoffset={(kf(p, TRAIL_OFFSET) / 100) * TRAIL_LEN} strokeOpacity={kf(p, TRAIL_OPACITY)} />
            <G transform="translate(-2.5 0)">
              <G opacity={kf(p, RK_OPACITY)} transform={`rotate(${kf(p, RK_ROT)} 60 24) translate(0 ${kf(p, RK_DROP)})`}>
                <Racket c={pal.mk} hole={pal.hole} />
              </G>
              <G opacity={kf(p, BT_OPACITY)} transform={`rotate(${kf(p, BT_ROT)} 60 24) translate(0 ${kf(p, BT_DROP)})`}>
                <Bat c={pal.mk} ridge={pal.hole} />
              </G>
            </G>
            <G opacity={kf(p, BURST_OPACITY)} transform={`translate(60 71) scale(${kf(p, BURST_SCALE)}) translate(-60 -71)`}>
              <Path d="M70 71 h6 M68.5 64.5 l4.2 -3.2 M68.5 77.5 l4.2 3.2" stroke={pal.spk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            </G>
            {SPARKS.map(([dx, dy, c, r], i) => {
              const f = kf(p, SPARK_MOVE);
              return <Circle key={`s${i}`} cx={66} cy={71} r={r} fill={c === 'ac' ? pal.ac : pal.spk} opacity={kf(p, SPARK_OPACITY)} transform={`translate(${dx * f} ${dy * f}) translate(66 71) scale(${kf(p, SPARK_SCALE)}) translate(-66 -71)`} />;
            })}
            <Circle cx={60} cy={71} r={8} fill="none" stroke={pal.ac} strokeWidth={1.4} opacity={kf(p, PULSE_OPACITY)} transform={`translate(60 71) scale(${kf(p, PULSE_SCALE)}) translate(-60 -71)`} />
            {DOTS.map(([dx, dy, c, r], i) => {
              const f = kf(p, DOT_MOVE);
              return <Circle key={`d${i}`} cx={60} cy={71} r={r} fill={c === 'ac' ? pal.ac : pal.spk} opacity={kf(p, DOT_OPACITY)} transform={`translate(${dx * f} ${dy * f}) translate(60 71) scale(${kf(p, DOT_SCALE)}) translate(-60 -71)`} />;
            })}
            <Circle cx={g1.x} cy={g1.y} r={6.5} fill={pal.ac} opacity={g1.o} />
            <Circle cx={g0.x} cy={g0.y} r={6.5} fill={pal.ac} opacity={g0.o} />
            <G opacity={kf(p, BALL_SHOW)} transform={`translate(${bx} ${by}) translate(0 3.6) scale(${kf(p, SQ_X)} ${kf(p, SQ_Y)}) translate(0 -3.6) rotate(${kf(p, SPIN)})`}>
              {four.map((b, i) => (
                <Face key={i} ball={b} tone={tone} opacity={faceOpacity(p, i)} />
              ))}
            </G>
          </G>
        </Svg>
      </View>
      {withWord ? (
        <>
          <View style={[styles.word, { marginTop: 18 * s, opacity: kf(p, WORD_WRAP) }]} accessibilityRole="header" accessibilityLabel="ArenaHub">
            {WORD.map((ch, i) => {
              const q = p - i * LETTER_DELAY_PCT;
              const fs = 58 * s;
              return (
                <Text
                  key={i}
                  style={{ fontFamily: Font.display, fontSize: fs, lineHeight: fs * 1.05, letterSpacing: -0.025 * fs, color: pal.wd, opacity: kf(q, LETTER_OPACITY), transform: [{ translateY: kf(q, LETTER_RISE) * s }, { scale: kf(q, LETTER_SCALE) }] }}>
                  {ch}
                </Text>
              );
            })}
          </View>
          <Text style={{ fontFamily: Font.body, fontSize: 17 * s, color: pal.tg, marginTop: 18 * s, opacity: kf(p, TAG_OPACITY), transform: [{ translateY: kf(p, TAG_RISE) * s }] }}>Find a court. Get a game.</Text>
        </>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ loader
function Loader({ tone = 'light', size = 72 }: { tone?: BrandTone; size?: number }) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const order = useMemo(() => shuffled(BALL_KEYS), []);
  const el = useClock(LAP_MS, true, reduce);
  const u = el / LAP_MS;
  const lap = Math.floor(u) % 8;
  const frac = u - Math.floor(u);
  const [x, y] = pointAt(LOOP_PATH, reduce ? 62 : frac * 100);
  const ball = order[reduce ? 0 : lap];
  const spin = ball === 'shuttle' ? -14 * Math.cos(frac * 2 * Math.PI) : frac * 360;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Svg width={size} height={size} viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
        <Still tone={tone} noBall />
        {reduce ? null : <Path d={RING2_D} fill="none" stroke={pal.run} strokeWidth={4.6} strokeLinecap="round" strokeDasharray={`${(26 / 200) * RING2_LEN} ${(400 / 200) * RING2_LEN}`} strokeDashoffset={((-74 - 100 * frac) / 200) * RING2_LEN} />}
        <G transform={`translate(${x} ${y}) rotate(${reduce ? 0 : spin})`}>
          <Face ball={ball} tone={tone} />
        </G>
      </Svg>
    </View>
  );
}

// ------------------------------------------------------------------ success
// okB of the logo file: 0% high and small, 20% visible, 62% lands squashed, 80% bounces 5 up, 100% rests
const OK_E = [0.4, 0, 0.6, 1] as const;
const OK_Y: Stop[] = [[0, -34, OK_E], [62, 0, OK_E], [80, -5, OK_E], [100, 0]];
const OK_SX: Stop[] = [[0, 0.7, OK_E], [62, 1.08, OK_E], [80, 1, OK_E], [100, 1]];
const OK_SY: Stop[] = [[0, 0.7, OK_E], [62, 0.86, OK_E], [80, 1, OK_E], [100, 1]];
const OK_OPACITY: Stop[] = [[0, 0, OK_E], [20, 1, OK_E], [100, 1]];
const SUCCESS_MS = 1200;

function Success({ tone = 'light', size = 120, onDone }: { tone?: BrandTone; size?: number; onDone?: () => void }) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const el = useClock(SUCCESS_MS, false, reduce);
  const done = useRef(false);
  useEffect(() => {
    if (!done.current && el >= SUCCESS_MS) {
      done.current = true;
      onDone?.();
    }
  }, [el]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = (1 - bezier([0.6, 0, 0.2, 1], clamp01(el / 600))) * 240;
  const d = clamp01((el - 250) / 500) * 100;
  const pulse = clamp01((el - 600) / 600);
  const pulseE = 1 - (1 - pulse) * (1 - pulse);
  const faint = tone === 'light' ? 'rgba(15,26,21,.18)' : 'rgba(196,245,70,.2)';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="Done">
      <Path d={RING_D} fill="none" stroke={faint} strokeWidth={3.2} />
      <Path d={RING_D} fill="none" stroke={pal.ac} strokeWidth={3.6} strokeLinecap="round" strokeDasharray={`${RING_LEN} ${RING_LEN}`} strokeDashoffset={(ring / 240) * RING_LEN} />
      <G transform="translate(-2.5 0)">
        <G transform="rotate(24 60 24)">
          <Racket c={pal.mk} hole={pal.hole} />
        </G>
        <G transform="rotate(-24 60 24)">
          <Bat c={pal.mk} ridge={pal.hole} />
        </G>
      </G>
      <Circle cx={60} cy={71} r={8} fill="none" stroke={pal.ac} strokeWidth={1.4} opacity={pulse <= 0 ? 0 : 0.8 * (1 - pulseE)} transform={`translate(60 71) scale(${1 + 2.6 * pulseE}) translate(-60 -71)`} />
      <G opacity={kf(d, OK_OPACITY)} transform={`translate(60 71) translate(0 ${kf(d, OK_Y)}) scale(${kf(d, OK_SX)} ${kf(d, OK_SY)})`}>
        <Face ball="football" tone={tone} />
      </G>
    </Svg>
  );
}

// ------------------------------------------------------------------ offline
function Offline({ size = 120 }: { size?: number }) {
  const reduce = useReducedMotion();
  const el = useClock(3000, true, reduce, 15);
  const y = reduce ? 0 : 1.5 - 1.5 * Math.cos((el / 3000) * 2 * Math.PI);
  const grey = '#8A968F';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="No connection">
      <Path d={RING_D} fill="none" stroke={grey} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="7 9" />
      <G transform="translate(-2.5 0)">
        <G transform="rotate(24 60 24)">
          <Racket c={grey} hole="#F1F2EF" />
        </G>
        <G transform="rotate(-24 60 24)">
          <Bat c={grey} ridge="#F1F2EF" />
        </G>
      </G>
      <G transform={`translate(0 ${y})`}>
        <G transform="translate(60 71)">
          <Circle r={8} fill="#C9D0CB" stroke={grey} strokeWidth={1.1} />
          <Path d="M0 -3.8 L3.6 -1.2 L2.2 3 H-2.2 L-3.6 -1.2 Z" fill={grey} />
        </G>
        <Path d="M50 83 L70 59" stroke="#CF4141" strokeWidth={3} strokeLinecap="round" />
      </G>
    </Svg>
  );
}

// ------------------------------------------------------------------ the one component
/** If an animated mark ever fails to draw, the still mark is shown instead (the app carries on). */
class MarkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    if (__DEV__) console.log('[brand] the animated mark failed, showing the still one:', error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function BrandMark({ mode = 'still', tone = 'light', ball = 'football', size, speed, balls, onLand, onSettled, onDone, withWord }: BrandMarkProps) {
  const s = size ?? 72;
  const still = (
    <Svg width={s} height={s} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="ArenaHub">
      <Still tone={tone} ball={ball} />
    </Svg>
  );
  if (mode === 'still') return still;
  // the animated modes: when one fails, the still mark stands in, and the callbacks the screen waits for still fire
  const fallback = <FallbackStill still={still} onLand={onLand} onSettled={onSettled} onDone={onDone} />;
  return (
    <MarkBoundary fallback={fallback}>
      {mode === 'hero' ? <Hero tone={tone} size={size} speed={speed} balls={balls} onLand={onLand} onSettled={onSettled} withWord={withWord} /> : null}
      {mode === 'loader' ? <Loader tone={tone} size={size} /> : null}
      {mode === 'success' ? <Success tone={tone} size={size} onDone={onDone} /> : null}
      {mode === 'offline' ? <Offline size={size} /> : null}
    </MarkBoundary>
  );
}

function FallbackStill({ still, onLand, onSettled, onDone }: { still: ReactNode; onLand?: () => void; onSettled?: () => void; onDone?: () => void }) {
  useEffect(() => {
    onLand?.();
    onSettled?.();
    onDone?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{still}</>;
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center' },
  word: { flexDirection: 'row' },
});

export { pickHeroBalls };
export type { BallKey, BrandMarkProps, BrandMode, BrandTone };
