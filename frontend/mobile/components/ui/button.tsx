import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useShake } from '@/hooks/use-shake';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';

// Values from design/prototypes/arena-hub-player-app.html .m-btn / .ghost /
// .lime (the CSS rules themselves, not the instance-measured table — those
// rows capture one call site's override, not the class's own declared
// style). The prototype has no `outline` variant; existing `outline` call
// sites are repointed to `ghost`, the closest match (secondary, unfilled).
//
// Motion (standing rule c, docs/MOBILE_QA_GATE.md; arena-hub-player-app-auth-2.html):
//   press     dips to 97.5% in 160 ms, no opacity change
//   loading   a spinner that keeps the button's full width and height
//   success   a short tick in place of the label
//   error     one shake
//   haptics   light on a primary press, success and error buzz on those states
//   reduce motion: the dip is instant and nothing shakes.
export type ButtonVariant = 'ink' | 'ghost' | 'lime' | 'danger';
export type ButtonStatus = 'success' | 'error' | undefined;

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  /** Set to 'success' or 'error' to play that feedback (see useButtonStatus). */
  status?: ButtonStatus;
}

const VARIANTS: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  ink: { bg: Colors.light.ink, border: Colors.light.ink, text: Colors.light.paper },
  ghost: { bg: Colors.light.card, border: Colors.light.line, text: Colors.light.text },
  lime: { bg: Colors.light.lime, border: Colors.light.lime, text: '#0F1A15' },
  // destructive: red, always shown next to a plain Stay / Cancel
  danger: { bg: Colors.light.red, border: Colors.light.red, text: '#FFFFFF' },
};

/**
 * A status that clears itself: `flash('error')` shows the error feedback and
 * goes back to normal after `ms`.
 */
export function useButtonStatus(ms = 1100): [ButtonStatus, (s: Exclude<ButtonStatus, undefined>) => void] {
  const [status, setStatus] = useState<ButtonStatus>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = useCallback(
    (s: Exclude<ButtonStatus, undefined>) => {
      clearTimeout(timer.current);
      // a quick off/on so the same status twice in a row plays again
      setStatus(undefined);
      requestAnimationFrame(() => setStatus(s));
      timer.current = setTimeout(() => setStatus(undefined), ms);
    },
    [ms],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return [status, flash];
}

export function Button({ title, variant = 'ink', loading, status, disabled, onPress, onPressIn, onPressOut, ...props }: ButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const { style: shakeStyle, shake } = useShake();
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (status === 'error') {
      shake();
      errorHaptic();
    } else if (status === 'success') {
      successHaptic();
    }
  }, [status, shake]);

  const dip = (to: number) => {
    scale.value = reduceMotion ? to : withTiming(to, { duration: 160, easing: Easing.out(Easing.cubic) });
  };

  return (
    <Animated.View style={[styles.wrap, shakeStyle]}>
      <Animated.View style={pressStyle}>
        <Pressable
          {...props}
          disabled={isDisabled}
          // The prototype's own press feedback is the dip above — a Material
          // ripple would add a visual the prototype doesn't draw, so unlike
          // the tab bar (PlatformPressable, G0b-2) this deliberately stays a
          // plain Pressable with no android_ripple.
          onPress={isDisabled ? undefined : onPress}
          onPressIn={(e) => {
            if (!isDisabled) {
              dip(0.975);
              if (variant !== 'ghost') tapHaptic();
            }
            onPressIn?.(e);
          }}
          onPressOut={(e) => {
            dip(1);
            onPressOut?.(e);
          }}
          accessibilityRole={props.accessibilityRole ?? 'button'}
          accessibilityState={{ ...props.accessibilityState, disabled: isDisabled, busy: !!loading }}
          accessibilityLabel={props.accessibilityLabel ?? title}
          style={[
            styles.base,
            { backgroundColor: v.bg, borderColor: v.border },
            // Added state, not in the prototype: opacity 0.5, a disabled button.
            isDisabled && !loading && styles.disabled,
          ]}>
          {/* the label always stays in the layout (hidden while loading or on
              success), so the button never changes size; the spinner or tick
              sits on top of it */}
          <Text style={[styles.text, { color: v.text }, (loading || status === 'success') && styles.hidden]}>{title}</Text>
          {loading ? (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator color={v.text} size={20} />
            </View>
          ) : status === 'success' ? (
            <View style={styles.overlay} pointerEvents="none">
              <Icon name="tick" size={18} color={v.text} strokeWidth={2.8} />
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  hidden: { opacity: 0 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  // 650 isn't a value RN's TextStyle['fontWeight'] union accepts, but it's
  // what the prototype declares and components/ui/text.tsx's
  // normalizeWeight() reads the raw string directly (Number('650') >= 650 ->
  // Bold) rather than relying on RN to understand it.
  text: { fontSize: 13.5, fontWeight: '650' } as unknown as TextStyle,
});
