import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type TextInput as RNTextInput,
  type TextInputProps,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui/icon';
import { TextInput } from '@/components/ui/text-input';
import { Colors } from '@/constants/theme';
import { TapBox } from '@/components/ui/tap-box';

// The one text field of the app. Base look: .m-search (arena-hub-player-app.html)
// as set out in arena-hub-player-app-auth-2.html: 52 tall, radius 15, 1.5px line
// border, icon 15, text 14; focused = ink border + a soft lime ring; error =
// red border.
//
// Mail and lock fields (`huge`) have the prototype's on-purpose behaviour (user
// decision, "Mobile standing rules" in docs/MOBILE_QA_GATE.md): while the field
// is empty and not focused the icon is HUGE (mail 104, lock 88 on a 390 wide
// phone) and the field grows to 138 to hold it, with the placeholder as a small
// 12px label beside the icon; focus or any text settles it to the normal field
// in 300 ms (height and icon size together, ease-out). Sizes scale with the
// phone width (360 to 430). With "reduce motion" on, the change is instant. The
// whole field is the touch target in both states. A password field also has
// the eye button, hidden while the field is huge.
export const FIELD_ACTIVE_HEIGHT = 52;
const IDLE_HEIGHT = 138; // at 390 wide
const ICON_SMALL = 15;
const ICON_HUGE: Partial<Record<IconName, number>> = { mail: 104, lock: 88 }; // at 390 wide
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);
const MS = 300;

interface FieldProps extends TextInputProps {
  icon?: IconName;
  /** Use the huge-when-idle behaviour (mail and lock fields only). */
  huge?: boolean;
  /** Show the eye button (password fields). Needs secureTextEntry. */
  revealable?: boolean;
  error?: boolean;
}

export const Field = forwardRef<RNTextInput, FieldProps>(function Field(
  { icon, huge, revealable, error, style, onFocus, onBlur, value, secureTextEntry, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inner = useRef<RNTextInput>(null);
  useImperativeHandle(ref, () => inner.current as RNTextInput);

  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const scale = Math.min(430, Math.max(360, width)) / 390;
  const hugeIcon = huge && icon ? Math.round((ICON_HUGE[icon] ?? 104) * scale) : ICON_SMALL;
  const idleHeight = Math.round(IDLE_HEIGHT * scale);

  // active = focused or has text; a field with nothing in it and no focus is idle
  const active = !huge || focused || (value ?? '').length > 0;
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = reduceMotion
      ? active
        ? 1
        : 0
      : withTiming(active ? 1 : 0, { duration: MS, easing: EASE });
  }, [active, reduceMotion, progress]);

  const boxStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [idleHeight, FIELD_ACTIVE_HEIGHT]),
  }));
  const slotStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [hugeIcon, ICON_SMALL]);
    return {
      width: size,
      height: size,
      marginLeft: interpolate(progress.value, [0, 1], [6, 0]),
      marginRight: interpolate(progress.value, [0, 1], [8, 0]),
    };
  });
  // the icon is drawn once at its huge size and scaled down, so one animation
  // drives both size and position
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, ICON_SMALL / hugeIcon]) }],
  }));
  const eyeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  // the eye and the crossed-out eye (frame 4 of the auth-2 prototype) swap by
  // fading into each other (150 ms) inside one 18px box, so nothing moves
  const crossed = useSharedValue(0);
  useEffect(() => {
    crossed.value = reduceMotion ? (revealed ? 1 : 0) : withTiming(revealed ? 1 : 0, { duration: 150, easing: EASE });
  }, [revealed, reduceMotion, crossed]);
  const eyeOnStyle = useAnimatedStyle(() => ({ opacity: 1 - crossed.value }));
  const eyeOffStyle = useAnimatedStyle(() => ({ opacity: crossed.value }));

  const showEye = revealable && secureTextEntry;
  return (
    <Pressable accessible={false} onPress={() => inner.current?.focus()}>
      <Animated.View
        style={[styles.base, focused && !error && styles.focused, error && styles.error, huge && boxStyle, !huge && styles.normalHeight]}>
        {icon ? (
          huge ? (
            <Animated.View style={slotStyle} pointerEvents="none">
              <Animated.View
                style={[{ width: hugeIcon, height: hugeIcon, transformOrigin: 'top left' } as object, iconStyle]}>
                <Icon name={icon} size={hugeIcon} color={active ? '#6C7771' : '#7F8A84'} />
              </Animated.View>
            </Animated.View>
          ) : (
            <Icon name={icon} size={ICON_SMALL} color="#6C7771" />
          )
        ) : null}
        <TextInput
          ref={inner}
          {...props}
          value={value}
          secureTextEntry={secureTextEntry && !revealed}
          style={[styles.input, huge && !active && styles.inputIdle, style]}
          placeholderTextColor="#8B958F"
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {showEye ? (
          <Animated.View style={eyeStyle} pointerEvents={active ? 'auto' : 'none'}>
            <TapBox
              onPress={() => setRevealed((r) => !r)}
              slop={13}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              accessibilityState={{ checked: revealed }}>
              <View style={styles.eyeBox}>
                <Animated.View style={[StyleSheet.absoluteFill, eyeOnStyle]}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" stroke="#6C7771" strokeWidth={2} />
                    <Circle cx={12} cy={12} r={3} stroke="#6C7771" strokeWidth={2} />
                  </Svg>
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, eyeOffStyle]}>
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M2 12s3.5-7 10-7c2 0 3.7.6 5.1 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.1-1.5"
                      stroke={Colors.light.ink}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <Circle cx={12} cy={12} r={3} stroke={Colors.light.ink} strokeWidth={2} />
                    <Path d="M4 4l16 16" stroke={Colors.light.ink} strokeWidth={2.2} strokeLinecap="round" />
                  </Svg>
                </Animated.View>
              </View>
            </TapBox>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    backgroundColor: Colors.light.card,
    borderWidth: 1.5,
    borderColor: Colors.light.line,
    borderRadius: 15,
  },
  eyeBox: { width: 18, height: 18 },
  normalHeight: { height: FIELD_ACTIVE_HEIGHT },
  focused: { borderColor: Colors.light.ink, boxShadow: '0 0 0 3px rgba(196,245,70,0.45)' },
  error: { borderColor: Colors.light.destructive },
  // outlineStyle: the browser's own focus ring would draw a second box inside
  // the field's ink focus border (web only; ignored on iOS/Android)
  input: { flex: 1, fontSize: 14, color: Colors.light.text, padding: 0, outlineStyle: 'none' } as object,
  // the small label beside the huge icon
  inputIdle: { fontSize: 12 },
});
