import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

// The success mark of arena-hub-player-app-auth-2.html (frame 5, ".tick"):
// a lime-deep circle with a pale lime fill draws first (600 ms), then the ink
// tick draws (400 ms, starting at 450 ms), both ease-out. 84px by default.
// With "reduce motion" on, it is simply drawn. `play` changes replay it.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const CIRCLE_LEN = 226;
const TICK_LEN = 60;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

export function ConfirmTick({ size = 84, play = 0 }: { size?: number; play?: number }) {
  const reduceMotion = useReducedMotion();
  const circle = useSharedValue(reduceMotion ? 0 : CIRCLE_LEN);
  const tick = useSharedValue(reduceMotion ? 0 : TICK_LEN);

  useEffect(() => {
    if (reduceMotion) {
      circle.value = 0;
      tick.value = 0;
      return;
    }
    circle.value = CIRCLE_LEN;
    tick.value = TICK_LEN;
    circle.value = withTiming(0, { duration: 600, easing: EASE });
    tick.value = withDelay(450, withTiming(0, { duration: 400, easing: EASE }));
  }, [play, reduceMotion, circle, tick]);

  const circleProps = useAnimatedProps(() => ({ strokeDashoffset: circle.value }));
  const tickProps = useAnimatedProps(() => ({ strokeDashoffset: tick.value }));

  return (
    <Svg width={size} height={size} viewBox="0 0 84 84" accessibilityRole="image" accessibilityLabel="Done">
      <AnimatedCircle
        cx={42}
        cy={42}
        r={36}
        stroke={Colors.light.limeDeep}
        fill="#EAF7C2"
        strokeWidth={3}
        strokeDasharray={CIRCLE_LEN}
        animatedProps={circleProps}
      />
      <AnimatedPath
        d="M27 43l10 10 20-22"
        stroke={Colors.light.ink}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={TICK_LEN}
        animatedProps={tickProps}
      />
    </Svg>
  );
}
