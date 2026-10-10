import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { tapHaptic } from '@/lib/haptics';

/**
 * A pressable that dips to 97.5% in 160 ms while held (standing rule c): cards,
 * rows and chips. `haptic` adds the light tap for primary presses. Instant
 * under "reduce motion".
 */
interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** The outer box (the card: border, background, spacing). */
  style?: StyleProp<ViewStyle>;
  /** The pressable itself, for laying its children out (a row). */
  contentStyle?: StyleProp<ViewStyle>;
  haptic?: boolean;
}

export function PressableScale({ style, contentStyle, haptic, onPressIn, onPressOut, children, ...props }: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dip = (to: number) => {
    scale.value = reduceMotion ? to : withTiming(to, { duration: 160, easing: Easing.out(Easing.cubic) });
  };
  return (
    <Animated.View style={[animated, style]}>
      <Pressable
        {...props}
        style={contentStyle}
        onPressIn={(e) => {
          dip(0.975);
          if (haptic) tapHaptic();
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          dip(1);
          onPressOut?.(e);
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
