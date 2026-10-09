import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { TextInput } from '@/components/ui/text-input';

// Base values from .m-search (arena-hub-player-app.html). The prototype is a
// static mockup with no focused/error state drawn, so those two are added
// here — not in the prototype — for G1's form work:
//   focused: border -> ink, 1.5px (thicker/darker, not lime — the
//     colour-as-meaning rule reserves lime for live status and primary
//     action, so focus uses the same ink the rest of the UI uses for
//     emphasis, e.g. the primary button).
//   error: border -> destructive red, an existing token, no new colour.
//
// FieldProps extends TextInputProps, and everything not destructured below
// spreads onto the underlying TextInput — onSubmitEditing, returnKeyType,
// blurOnSubmit, autoComplete, textContentType and importantForAutofill all
// already pass through that way; none needed adding. The one real gap was
// the ref itself: nothing outside Field could reach the input to call
// .focus(), which G1's autofocus-first-field and return-key-to-next-field
// both need. forwardRef fixes that.
interface FieldProps extends TextInputProps {
  icon?: React.ReactNode;
  error?: boolean;
}

export const Field = forwardRef<RNTextInput, FieldProps>(function Field(
  { icon, error, style, onFocus, onBlur, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inner = useRef<RNTextInput>(null);
  useImperativeHandle(ref, () => inner.current as RNTextInput);
  // The whole box is the touch target (the prototype's box is ~41 tall; the
  // 44 minimum height below makes it a full-size one), not just the text line.
  return (
    <Pressable
      accessible={false}
      onPress={() => inner.current?.focus()}
      style={[
        styles.base,
        focused && !error && styles.focused,
        error && styles.error,
      ]}>
      {icon}
      <TextInput
        ref={inner}
        {...props}
        style={[styles.input, style]}
        placeholderTextColor={Colors.light.muted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 13,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.line,
    borderRadius: 12,
  },
  focused: { borderColor: Colors.light.ink, borderWidth: 1.5 },
  error: { borderColor: Colors.light.destructive, borderWidth: 1.5 },
  // The prototype's own .m-search text colour (muted) is for its
  // placeholder-only mock; a real typed value reads better in ink.
  // outlineStyle: the browser's own focus ring would draw a second box inside
  // the field's ink focus border (web only; ignored on iOS/Android)
  input: { flex: 1, fontSize: 12.5, color: Colors.light.text, padding: 0, outlineStyle: 'none' } as object,
});
