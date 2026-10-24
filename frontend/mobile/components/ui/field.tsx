import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type TextInputProps, type TextInputInstance } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui/icon';
import { TextInput } from '@/components/ui/text-input';
import { Colors } from '@/constants/theme';
import { TapBox } from '@/components/ui/tap-box';

// The one text field of the app (arena-hub-player-app-auth-2-fixed.html, .field): always 48 tall, radius 15,
// 1.5px line border, icon 20, text 14; focused = ink border + a soft lime ring; error = red border. Empty or
// filled, focused or not, nothing changes size (the old "huge idle icon" frames are replaced). A password field
// also has the eye button. The whole field is the touch target.
export const FIELD_HEIGHT = 48;
export const FIELD_ICON = 20;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

interface FieldProps extends TextInputProps {
  icon?: IconName;
  /** Show the eye button (password fields). Needs secureTextEntry. */
  revealable?: boolean;
  error?: boolean;
}

export const Field = forwardRef<TextInputInstance, FieldProps>(function Field(
  { icon, revealable, error, style, onFocus, onBlur, value, secureTextEntry, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inner = useRef<TextInputInstance>(null);
  useImperativeHandle(ref, () => inner.current as TextInputInstance);
  const reduceMotion = useReducedMotion();

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
      <View testID="icon-field" style={[styles.base, focused && !error && styles.focused, error && styles.error]}>
        {icon ? <Icon name={icon} size={FIELD_ICON} color="#6C7771" /> : null}
        <TextInput
          ref={inner}
          {...props}
          value={value}
          secureTextEntry={secureTextEntry && !revealed}
          style={[styles.input, style]}
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
          <View>
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
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    height: FIELD_HEIGHT,
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
  focused: { borderColor: Colors.light.ink, boxShadow: '0 0 0 3px rgba(196,245,70,0.45)' },
  error: { borderColor: Colors.light.destructive },
  // outlineStyle: the browser's own focus ring would draw a second box inside
  // the field's ink focus border (web only; ignored on iOS/Android)
  // fills the field's height, so the text box itself is the full tap target (not only its text line)
  input: { flex: 1, alignSelf: 'stretch', fontSize: 14, color: Colors.light.text, padding: 0, outlineStyle: 'none' } as object,
});
