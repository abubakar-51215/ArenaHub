import * as SplashScreen from 'expo-splash-screen';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { BrandMark } from '@/components/brand/brand-mark';
import { SPLASH_FADE_MS, SPLASH_MAX_MS, SPLASH_SPEED_FIRST_LAUNCH, SPLASH_SPEED_LATER_LAUNCHES } from '@/constants/brand';
import { Colors } from '@/constants/theme';
import { hasLaunchedBefore, markLaunched } from '@/lib/first-launch';
import { startupLog } from '@/lib/startup-log';

/**
 * The animated splash, above the whole app. The first start after install plays the full 7.2 s timeline;
 * every later cold start plays it faster (SPLASH_SPEED_LATER_LAUNCHES). The app shows once the session is
 * ready AND the wordmark has come in; a tap skips the rest (still waits for the session). Whatever happens, it
 * leaves after SPLASH_MAX_MS. The native splash (the still dark mark on ink) stays up until this has drawn its
 * first frame. It uses only React Native's own Animated (no worklets), and an error boundary: if anything in
 * it fails it disappears and the app carries on.
 */
function Splash({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [speed] = useState(() => (hasLaunchedBefore() ? SPLASH_SPEED_LATER_LAUNCHES : SPLASH_SPEED_FIRST_LAUNCH));
  const [settled, setSettled] = useState(false);
  const [forced, setForced] = useState(false);
  const [gone, setGone] = useState(false);
  const leaving = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    markLaunched();
    startupLog(`splash shown (${speed === SPLASH_SPEED_FIRST_LAUNCH ? 'first launch, full speed' : `later launch, ${speed}x`})`);
    const t = setTimeout(() => {
      startupLog(`splash safety: ${SPLASH_MAX_MS / 1000} s passed, leaving the splash`);
      setForced(true);
    }, SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSettled = () => {
    startupLog('splash animation finished (or skipped by a tap)');
    setSettled(true);
  };

  const go = (settled && ready) || forced;
  useEffect(() => {
    if (!go || leaving.current) return;
    leaving.current = true;
    SplashScreen.hideAsync().catch(() => {}); // always, even if the first frame never drew
    startupLog(`leaving the splash (${forced && !(settled && ready) ? 'safety timer' : 'animation finished and session ready'})`);
    if (reduce) {
      setGone(true);
      return;
    }
    Animated.timing(opacity, { toValue: 0, duration: SPLASH_FADE_MS, useNativeDriver: true }).start();
    const t = setTimeout(() => setGone(true), SPLASH_FADE_MS + 30);
    return () => clearTimeout(t);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, { opacity }]} pointerEvents={go ? 'none' : 'auto'}>
      <Pressable
        style={styles.fill}
        onPress={onSettled}
        onLayout={() => SplashScreen.hideAsync().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="ArenaHub. Tap to skip the intro">
        <BrandMark mode="hero" tone="dark" size={220} speed={speed} onSettled={onSettled} />
      </Pressable>
    </Animated.View>
  );
}

/** If the splash itself fails, show nothing (and take the native splash away) so the app is never blocked. */
class SplashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    startupLog(`the splash failed (${error.message}): carrying on without it`);
    SplashScreen.hideAsync().catch(() => {});
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function AnimatedSplash({ ready }: { ready: boolean }) {
  return (
    <SplashBoundary>
      <Splash ready={ready} />
    </SplashBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.light.ink, zIndex: 100 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
