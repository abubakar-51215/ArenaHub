import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInputInstance } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Colors } from '@/constants/theme';

// Values from .otp-row / .otp-box in arena-hub-player-app-auth.html: radius
// 10, 1px line border on a card, focused = 1.5px ink, filled = line-soft
// fill, error = red border, Archivo 19/700 digits. The prototype's boxes are
// 38 wide; these are 44 so each one is a full-size touch target, and six of
// them (6 x 44 + 5 x 8 = 304) still fit the narrowest phone (360 - 2 x 18).
//
// One real TextInput sits invisibly over the six boxes and holds the whole
// code; the boxes only draw it. That makes paste (the whole code at once), a
// keyboard's one-time-code suggestion, auto-advance (the next box is simply
// the next character) and backspace (the last character goes) behave the
// same on web, iOS and Android, with nothing to keep in step between six
// separate inputs.
const BOX_W = 44;
const BOX_H = 48;

interface CodeBoxesProps {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  /** Return / "done" on the keyboard. */
  onSubmit?: () => void;
  accessibilityLabel?: string;
}

export function CodeBoxes({
  value,
  onChange,
  length = 6,
  error,
  autoFocus,
  onSubmit,
  accessibilityLabel = 'Verification code',
}: CodeBoxesProps) {
  const ref = useRef<TextInputInstance>(null);
  const [focused, setFocused] = useState(false);
  const current = Math.min(value.length, length - 1);

  // a wrong code leaves the box row ready to edit: focus can be lost while the
  // request is in flight, and the next key should go straight in
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  return (
    <Pressable onPress={() => ref.current?.focus()} accessible={false} style={styles.row}>
      {Array.from({ length }, (_, i) => {
        const digit = value[i];
        const isFocused = focused && i === current;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.box,
              digit != null && styles.filled,
              isFocused && styles.focused,
              error && styles.error,
            ]}>
            <Text variant="archivo" style={styles.digit}>
              {digit ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        // no maxLength: a pasted "482 913" must be cleaned first, then cut to length
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCorrect={false}
        returnKeyType="done"
        caretHidden
        accessibilityLabel={`${accessibilityLabel}, ${length} digits`}
        style={styles.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative' },
  box: {
    width: BOX_W,
    height: BOX_H,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.line,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { backgroundColor: Colors.light.lineSoft },
  focused: { borderColor: Colors.light.ink, borderWidth: 1.5, backgroundColor: Colors.light.card },
  error: { borderColor: Colors.light.destructive, borderWidth: 1.5 },
  digit: { fontSize: 19, fontWeight: '700', color: Colors.light.text },
  // Covers the row, so a tap anywhere lands in it; invisible but not
  // display:none, which would stop it taking focus.
  input: {
    ...StyleSheet.absoluteFill,
    opacity: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    color: 'transparent',
    fontSize: 16, // 16+ stops iOS Safari zooming the page on focus
  },
});
