import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { BrandMark } from '@/components/brand/brand-mark';
import { SPLASH_FADE_MS, SPLASH_SPEED_FIRST_LAUNCH, SPLASH_SPEED_LATER_LAUNCHES } from '@/constants/brand';
import { Colors } from '@/constants/theme';
import { hasLaunchedBefore, markLaunched } from '@/lib/first-launch';

/**
 * The animated splash, above the whole app. The first start after install plays the full 7.2 s timeline;
 * every later cold start plays it faster (SPLASH_SPEED_LATER_LAUNCHES). The app shows once the session is
 * ready AND the wordmark has come in; a tap skips the rest (still waits for the session).
 * The native splash (the still dark mark on ink) stays up until this has drawn its first frame.
 */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const [speed] = useState(() => (hasLaunchedBefore() ? SPLASH_SPEED_LATER_LAUNCHES : SPLASH_SPEED_FIRST_LAUNCH));
  const [settled, setSettled] = useState(false);
  const [gone, setGone] = useState(false);
  const leaving = useRef(false);
  const opacity = useSharedValue(1);

  useEffect(() => {
    markLaunched();
  }, []);

  const finish = () => setGone(true);
  const go = settled && ready;
  useEffect(() => {
    if (!go || leaving.current) return;
    leaving.current = true;
    if (reduce) {
      finish();
      return;
    }
    opacity.value = withTiming(0, { duration: SPLASH_FADE_MS, easing: Easing.out(Easing.quad) });
    // a plain timer ends it (the animation callback is unreliable on web)
    const t = setTimeout(finish, SPLASH_FADE_MS + 30);
    return () => clearTimeout(t);
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (gone) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.wrap, style]} pointerEvents={go ? 'none' : 'auto'}>
      <Pressable
        style={styles.fill}
        onPress={() => setSettled(true)}
        onLayout={() => SplashScreen.hideAsync().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel="ArenaHub. Tap to skip the intro">
        <BrandMark mode="hero" tone="dark" size={220} speed={speed} onSettled={() => setSettled(true)} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: Colors.light.ink, zIndex: 100 },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
