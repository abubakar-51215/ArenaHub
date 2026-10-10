import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { BALL_FACES, BALL_KEYS } from '@/constants/brand-faces.generated';
import { Font } from '@/constants/theme';
import { PAL, pickHeroBalls, type BallKey, type BrandMarkProps, type BrandMode, type BrandTone } from '@/components/brand/brand-shared';
import * as M from '@/lib/brand-motion';
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

const AG = Animated.createAnimatedComponent(G);
const AP = Animated.createAnimatedComponent(Path);
const AC = Animated.createAnimatedComponent(Circle);

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

// ------------------------------------------------------------------ hero
const SPARKS: [number, number, 'ac' | 'spk', number][] = [[11, -7, 'ac', 1.3], [13, 2, 'spk', 1.1], [9, 9, 'ac', 1.3], [4, -11, 'spk', 1]];
const DOTS: [number, number, 'ac' | 'spk', number][] = [[18, 0, 'ac', 1.4], [12.7, 10.2, 'spk', 1.1], [0, 14.4, 'ac', 1.4], [-12.7, 10.2, 'spk', 1.1], [-18, 0, 'ac', 1.4], [-12.7, -10.2, 'spk', 1.1], [0, -14.4, 'ac', 1.4], [12.7, -10.2, 'spk', 1.1]];

export interface HeroProps {
  tone?: BrandTone;
  /** mark width in px (the wordmark and tagline scale with it) */
  size?: number;
  /** playback speed: 1 is the 7.2 s timeline, 2 plays it in half the time */
  speed?: number;
  /** the four balls to show (bowled, two laps, landing); picked at random when omitted */
  balls?: BallKey[];
  /** the ball has landed in the middle (a light tap is felt) */
  onLand?: () => void;
  /** the wordmark and tagline are in */
  onSettled?: () => void;
  withWord?: boolean;
}

function Hero({ tone = 'dark', size = 264, speed = 1, balls, onLand, onSettled, withWord = true }: HeroProps) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 1 : 0);
  const four = useMemo(() => balls ?? pickHeroBalls(), [balls]);
  const k = size / 120;
  const landed = useRef(false);
  const settled = useRef(false);
  const fireLand = () => {
    if (landed.current) return;
    landed.current = true;
    tapHaptic();
    onLand?.();
  };
  const fireSettled = () => {
    if (settled.current) return;
    settled.current = true;
    onSettled?.();
  };

  useEffect(() => {
    if (reduce) {
      t.value = 1;
      fireLand();
      fireSettled();
      return;
    }
    t.value = 0;
    t.value = withTiming(1, { duration: M.HERO_MS / speed, easing: Easing.linear });
    return () => cancelAnimation(t);
  }, [reduce, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  useAnimatedReaction(
    () => Math.floor(t.value * 100 * 10),
    (v, prev) => {
      if (v >= M.LAND_PCT * 10 && (prev ?? 0) < M.LAND_PCT * 10) runOnJS(fireLand)();
      if (v >= 820 && (prev ?? 0) < 820) runOnJS(fireSettled)();
    },
  );

  const P = () => t.value * 100;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: (M.kf(P(), M.TRACK_OFFSET) / 240) * M.RING_LEN,
    strokeOpacity: M.kf(P(), M.TRACK_OPACITY),
  }));
  const glintProps = useAnimatedProps(() => ({
    strokeDashoffset: (M.kf(P(), M.GLINT_OFFSET) / 240) * M.RING_LEN,
    strokeOpacity: M.kf(P(), M.GLINT_OPACITY),
  }));
  const trailProps = useAnimatedProps(() => ({
    strokeDashoffset: (M.kf(P(), M.TRAIL_OFFSET) / 100) * M.TRAIL_LEN,
    strokeOpacity: M.kf(P(), M.TRAIL_OPACITY),
  }));
  const rkProps = useAnimatedProps(() => ({
    opacity: M.kf(P(), M.RK_OPACITY),
    transform: `rotate(${M.kf(P(), M.RK_ROT)} 60 24) translate(0 ${M.kf(P(), M.RK_DROP)})`,
  }));
  const btProps = useAnimatedProps(() => ({
    opacity: M.kf(P(), M.BT_OPACITY),
    transform: `rotate(${M.kf(P(), M.BT_ROT)} 60 24) translate(0 ${M.kf(P(), M.BT_DROP)})`,
  }));
  const shakeProps = useAnimatedProps(() => ({ transform: `translate(${M.kf(P(), M.SHAKE_X)} ${M.kf(P(), M.SHAKE_Y)})` }));
  const burstProps = useAnimatedProps(() => ({
    opacity: M.kf(P(), M.BURST_OPACITY),
    transform: `translate(60 71) scale(${M.kf(P(), M.BURST_SCALE)}) translate(-60 -71)`,
  }));
  const pulseProps = useAnimatedProps(() => ({
    opacity: M.kf(P(), M.PULSE_OPACITY),
    transform: `translate(60 71) scale(${M.kf(P(), M.PULSE_SCALE)}) translate(-60 -71)`,
  }));
  const ballProps = useAnimatedProps(() => {
    const p = P();
    const [x, y] = M.pointAt(M.HERO_PATH, M.kf(p, M.BALL_DIST));
    const sx = M.kf(p, M.SQ_X);
    const sy = M.kf(p, M.SQ_Y);
    return { opacity: M.kf(p, M.BALL_SHOW), transform: `translate(${x} ${y}) translate(0 3.6) scale(${sx} ${sy}) translate(0 -3.6) rotate(${M.kf(p, M.SPIN)})` };
  });
  const g0 = useAnimatedProps(() => {
    const p = P() - M.GHOST_DELAY_PCT[0];
    const [x, y] = M.pointAt(M.HERO_PATH, M.kf(p, M.BALL_DIST));
    return { opacity: M.kf(p, M.ghostStops(M.GHOST_OPACITY[0])), cx: x, cy: y };
  });
  const g1 = useAnimatedProps(() => {
    const p = P() - M.GHOST_DELAY_PCT[1];
    const [x, y] = M.pointAt(M.HERO_PATH, M.kf(p, M.BALL_DIST));
    return { opacity: M.kf(p, M.ghostStops(M.GHOST_OPACITY[1])), cx: x, cy: y };
  });
  const shockStyle = useAnimatedStyle(() => ({ opacity: M.kf(P(), M.SHOCK_OPACITY), transform: [{ scale: M.kf(P(), M.SHOCK_SCALE) }] }));

  const pad = 100; // room around the mark for sparks and the shock ring
  return (
    <View style={styles.lockup}>
      <View style={{ width: size, height: size }}>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: size / 2 - 27.3 * k,
              top: 71 * k - 27.3 * k,
              width: 54.6 * k,
              height: 54.6 * k,
              borderRadius: 54.6 * k,
              borderWidth: Math.max(1, 0.9 * k),
              borderColor: pal.ac,
            },
            shockStyle,
          ]}
        />
        <Svg
          width={size * ((120 + 2 * pad) / 120)}
          height={size * ((120 + 2 * pad) / 120)}
          viewBox={`${-pad} ${-pad} ${120 + 2 * pad} ${120 + 2 * pad}`}
          style={{ position: 'absolute', left: -pad * k, top: -pad * k }}
          accessibilityRole="image"
          accessibilityLabel="ArenaHub logo">
          <AG animatedProps={shakeProps}>
            <AP d={RING_D} fill="none" stroke={pal.ring} strokeWidth={3.2} strokeLinecap="round" strokeDasharray={`${M.RING_LEN} ${M.RING_LEN}`} animatedProps={ringProps} />
            <AP d={RING_D} fill="none" stroke={pal.ac} strokeWidth={4.6} strokeLinecap="round" strokeDasharray={`${(40 / 240) * M.RING_LEN} ${(400 / 240) * M.RING_LEN}`} animatedProps={glintProps} />
            <AP d={TRAIL_D} fill="none" stroke={pal.ac} strokeWidth={4.4} strokeLinecap="round" strokeDasharray={`${(14 / 100) * M.TRAIL_LEN} ${(300 / 100) * M.TRAIL_LEN}`} animatedProps={trailProps} />
            <G transform="translate(-2.5 0)">
              <AG animatedProps={rkProps}>
                <Racket c={pal.mk} hole={pal.hole} />
              </AG>
              <AG animatedProps={btProps}>
                <Bat c={pal.mk} ridge={pal.hole} />
              </AG>
            </G>
            <AG animatedProps={burstProps}>
              <Path d="M70 71 h6 M68.5 64.5 l4.2 -3.2 M68.5 77.5 l4.2 3.2" stroke={pal.spk} strokeWidth={1.6} strokeLinecap="round" fill="none" />
            </AG>
            {SPARKS.map(([dx, dy, c, r], i) => (
              <Spark key={`s${i}`} t={t} dx={dx} dy={dy} r={r} fill={c === 'ac' ? pal.ac : pal.spk} cx={66} cy={71} kind="spark" />
            ))}
            <AC cx={60} cy={71} r={8} fill="none" stroke={pal.ac} strokeWidth={1.4} animatedProps={pulseProps} />
            {DOTS.map(([dx, dy, c, r], i) => (
              <Spark key={`d${i}`} t={t} dx={dx} dy={dy} r={r} fill={c === 'ac' ? pal.ac : pal.spk} cx={60} cy={71} kind="dot" />
            ))}
            <AC r={6.5} fill={pal.ac} animatedProps={g1} />
            <AC r={6.5} fill={pal.ac} animatedProps={g0} />
            <AG animatedProps={ballProps}>
              {four.map((b, i) => (
                <FaceFade key={i} t={t} index={i} ball={b} tone={tone} />
              ))}
            </AG>
          </AG>
        </Svg>
      </View>
      {withWord ? <WordAndTag t={t} size={size} color={pal.wd} tag={pal.tg} /> : null}
    </View>
  );
}

function FaceFade({ t, index, ball, tone }: { t: { value: number }; index: number; ball: BallKey; tone: BrandTone }) {
  const props = useAnimatedProps(() => ({ opacity: M.faceOpacity(t.value * 100, index) }));
  return (
    <AG animatedProps={props}>
      <Face ball={ball} tone={tone} />
    </AG>
  );
}

function Spark({ t, dx, dy, r, fill, cx, cy, kind }: { t: { value: number }; dx: number; dy: number; r: number; fill: string; cx: number; cy: number; kind: 'spark' | 'dot' }) {
  const props = useAnimatedProps(() => {
    const p = t.value * 100;
    const o = kind === 'spark' ? M.SPARK_OPACITY : M.DOT_OPACITY;
    const mv = kind === 'spark' ? M.SPARK_MOVE : M.DOT_MOVE;
    const sc = kind === 'spark' ? M.SPARK_SCALE : M.DOT_SCALE;
    const f = M.kf(p, mv);
    return { opacity: M.kf(p, o), transform: `translate(${dx * f} ${dy * f}) translate(${cx} ${cy}) scale(${M.kf(p, sc)}) translate(${-cx} ${-cy})` };
  });
  return <AC cx={cx} cy={cy} r={r} fill={fill} animatedProps={props} />;
}

const WORD = 'ArenaHub'.split('');

function WordAndTag({ t, size, color, tag }: { t: { value: number }; size: number; color: string; tag: string }) {
  const s = size / 264;
  const wrapStyle = useAnimatedStyle(() => ({ opacity: M.kf(t.value * 100, M.WORD_WRAP) }));
  const tagStyle = useAnimatedStyle(() => ({ opacity: M.kf(t.value * 100, M.TAG_OPACITY), transform: [{ translateY: M.kf(t.value * 100, M.TAG_RISE) * s }] }));
  return (
    <>
      <Animated.View style={[styles.word, { marginTop: 18 * s }, wrapStyle]} accessibilityRole="header" accessibilityLabel="ArenaHub">
        {WORD.map((ch, i) => (
          <Letter key={i} t={t} i={i} ch={ch} fs={58 * s} color={color} />
        ))}
      </Animated.View>
      <Animated.Text style={[{ fontFamily: Font.body, fontSize: 17 * s, color: tag, marginTop: 18 * s }, tagStyle]}>Find a court. Get a game.</Animated.Text>
    </>
  );
}

function Letter({ t, i, ch, fs, color }: { t: { value: number }; i: number; ch: string; fs: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = t.value * 100 - i * M.LETTER_DELAY_PCT;
    return { opacity: M.kf(p, M.LETTER_OPACITY), transform: [{ translateY: M.kf(p, M.LETTER_RISE) * (fs / 58) }, { scale: M.kf(p, M.LETTER_SCALE) }] };
  });
  return <Animated.Text style={[{ fontFamily: Font.display, fontSize: fs, lineHeight: fs * 1.05, letterSpacing: -0.025 * fs, color }, style]}>{ch}</Animated.Text>;
}

// ------------------------------------------------------------------ loader
function Loader({ tone = 'light', size = 72 }: { tone?: BrandTone; size?: number }) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const order = useMemo(() => M.shuffled(BALL_KEYS), []);
  const u = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    u.value = 0;
    u.value = withRepeat(withTiming(8, { duration: M.LAP_MS * 8, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(u);
  }, [reduce, u]);

  const runProps = useAnimatedProps(() => ({ strokeDashoffset: ((-74 - 100 * (u.value - Math.floor(u.value))) / 200) * M.RING2_LEN }));
  const ballProps = useAnimatedProps(() => {
    const frac = u.value - Math.floor(u.value);
    const [x, y] = M.pointAt(M.LOOP_PATH, frac * 100);
    const lap = Math.floor(u.value) % 8;
    const sway = -14 * Math.cos(frac * 2 * Math.PI);
    const spin = order[lap] === 'shuttle' ? sway : frac * 360;
    return { transform: `translate(${x} ${y}) rotate(${spin})` };
  });
  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <Svg width={size} height={size} viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
        <Still tone={tone} noBall />
        {reduce ? null : <AP d={RING2_D} fill="none" stroke={pal.run} strokeWidth={4.6} strokeLinecap="round" strokeDasharray={`${(26 / 200) * M.RING2_LEN} ${(400 / 200) * M.RING2_LEN}`} animatedProps={runProps} />}
        {reduce ? (
          <G transform={`translate(${M.pointAt(M.LOOP_PATH, 62)[0]} ${M.pointAt(M.LOOP_PATH, 62)[1]})`}>
            <Face ball={order[0]} tone={tone} />
          </G>
        ) : (
          <AG animatedProps={ballProps}>
            {order.map((b, k) => (
              <LapFace key={b} u={u} k={k} ball={b} tone={tone} />
            ))}
          </AG>
        )}
      </Svg>
    </View>
  );
}

function LapFace({ u, k, ball, tone }: { u: { value: number }; k: number; ball: BallKey; tone: BrandTone }) {
  const props = useAnimatedProps(() => ({ opacity: Math.floor(u.value) % 8 === k ? 1 : 0 }));
  return (
    <AG animatedProps={props}>
      <Face ball={ball} tone={tone} />
    </AG>
  );
}

// ------------------------------------------------------------------ success
// okB of the logo file: 0% high and small, 20% visible, 62% lands squashed, 80% bounces 5 up, 100% rests
const OK_E = [0.4, 0, 0.6, 1] as const;
const OK_Y: M.Stop[] = [[0, -34, OK_E], [62, 0, OK_E], [80, -5, OK_E], [100, 0]];
const OK_SX: M.Stop[] = [[0, 0.7, OK_E], [62, 1.08, OK_E], [80, 1, OK_E], [100, 1]];
const OK_SY: M.Stop[] = [[0, 0.7, OK_E], [62, 0.86, OK_E], [80, 1, OK_E], [100, 1]];
const OK_OPACITY: M.Stop[] = [[0, 0, OK_E], [20, 1, OK_E], [100, 1]];
function Success({ tone = 'light', size = 120, onDone }: { tone?: BrandTone; size?: number; onDone?: () => void }) {
  const pal = PAL[tone];
  const reduce = useReducedMotion();
  const ring = useSharedValue(reduce ? 0 : 240);
  const drop = useSharedValue(reduce ? 1 : 0);
  const pulse = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      onDone?.();
      return;
    }
    ring.value = withTiming(0, { duration: 600, easing: Easing.bezier(0.6, 0, 0.2, 1) });
    drop.value = withDelay(250, withTiming(1, { duration: 500, easing: Easing.bezier(0.4, 0, 0.6, 1) }));
    pulse.value = withDelay(600, withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }, (f) => {
      if (f && onDone) runOnJS(onDone)();
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: (ring.value / 240) * M.RING_LEN }));
  const ballProps = useAnimatedProps(() => {
    const d = drop.value * 100;
    return {
      opacity: M.kf(d, OK_OPACITY),
      transform: `translate(60 71) translate(0 ${M.kf(d, OK_Y)}) scale(${M.kf(d, OK_SX)} ${M.kf(d, OK_SY)})`,
    };
  });
  const pulseProps = useAnimatedProps(() => ({ opacity: pulse.value <= 0 ? 0 : 0.8 * (1 - pulse.value), transform: `translate(60 71) scale(${1 + 2.6 * pulse.value}) translate(-60 -71)` }));
  const faint = tone === 'light' ? 'rgba(15,26,21,.18)' : 'rgba(196,245,70,.2)';
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="Done">
      <Path d={RING_D} fill="none" stroke={faint} strokeWidth={3.2} />
      <AP d={RING_D} fill="none" stroke={pal.ac} strokeWidth={3.6} strokeLinecap="round" strokeDasharray={`${M.RING_LEN} ${M.RING_LEN}`} animatedProps={ringProps} />
      <G transform="translate(-2.5 0)">
        <G transform="rotate(24 60 24)">
          <Racket c={pal.mk} hole={pal.hole} />
        </G>
        <G transform="rotate(-24 60 24)">
          <Bat c={pal.mk} ridge={pal.hole} />
        </G>
      </G>
      <AC cx={60} cy={71} r={8} fill="none" stroke={pal.ac} strokeWidth={1.4} animatedProps={pulseProps} />
      <AG animatedProps={ballProps}>
        <Face ball="football" tone={tone} />
      </AG>
    </Svg>
  );
}

// ------------------------------------------------------------------ offline
function Offline({ size = 120 }: { size?: number }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withRepeat(withTiming(3, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(y);
  }, [reduce, y]);
  const ballProps = useAnimatedProps(() => ({ transform: `translate(0 ${y.value})` }));
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
      <AG animatedProps={ballProps}>
        <G transform="translate(60 71)">
          <Circle r={8} fill="#C9D0CB" stroke={grey} strokeWidth={1.1} />
          <Path d="M0 -3.8 L3.6 -1.2 L2.2 3 H-2.2 L-3.6 -1.2 Z" fill={grey} />
        </G>
        <Path d="M50 83 L70 59" stroke="#CF4141" strokeWidth={3} strokeLinecap="round" />
      </AG>
    </Svg>
  );
}

// ------------------------------------------------------------------ the one component
export function BrandMark({ mode = 'still', tone = 'light', ball = 'football', size, speed, balls, onLand, onSettled, onDone, withWord }: BrandMarkProps) {
  if (mode === 'hero') return <Hero tone={tone} size={size} speed={speed} balls={balls} onLand={onLand} onSettled={onSettled} withWord={withWord} />;
  if (mode === 'loader') return <Loader tone={tone} size={size} />;
  if (mode === 'success') return <Success tone={tone} size={size} onDone={onDone} />;
  if (mode === 'offline') return <Offline size={size} />;
  const s = size ?? 72;
  return (
    <Svg width={s} height={s} viewBox="0 0 120 120" accessibilityRole="image" accessibilityLabel="ArenaHub">
      <Still tone={tone} ball={ball} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  lockup: { alignItems: 'center' },
  word: { flexDirection: 'row' },
});

export { M as brandMotion, pickHeroBalls };
export type { BallKey, BrandMarkProps, BrandMode, BrandTone };
