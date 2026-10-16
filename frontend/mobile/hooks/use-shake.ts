import { useCallback } from 'react';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * One gentle shake for an error (the prototype's `shake` keyframes: left 6,
 * right 5, left 3, right 2 over about 420 ms). `style` goes on an
 * Animated.View around whatever should shake; `shake()` plays it. With
 * "reduce motion" on, nothing moves.
 */
export function useShake() {
  const x = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const shake = useCallback(() => {
    if (reduceMotion) return;
    const t = (to: number) => withTiming(to, { duration: 84 });
    x.value = withSequence(t(-6), t(5), t(-3), t(2), t(0));
  }, [reduceMotion, x]);

  return { style, shake };
}
