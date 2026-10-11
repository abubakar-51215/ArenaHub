import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput as RNTextInput, type TextInputProps } from 'react-native';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';

import { Colors } from '@/constants/theme';

/**
 * The kinds of text box and the keyboard settings each one needs (rule: docs/MOBILE_QA_GATE.md "Keyboard"). A screen
 * says what the box is for (`kind`) and gets the right keyboard, capital letters, auto-fill and action key; props
 * passed explicitly still win.
 */
export type TextFieldKind = 'text' | 'name' | 'email' | 'phone' | 'password' | 'newPassword' | 'code' | 'promo' | 'multiline' | 'number';

const PRESETS: Record<TextFieldKind, TextInputProps> = {
  text: { autoCapitalize: 'sentences' },
  name: { autoCapitalize: 'words', autoComplete: 'name', textContentType: 'name' },
  email: {
    keyboardType: 'email-address',
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'email',
    textContentType: 'emailAddress',
  },
  phone: { keyboardType: 'phone-pad', autoCorrect: false, autoComplete: 'tel', textContentType: 'telephoneNumber' },
  password: {
    secureTextEntry: true,
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'current-password',
    textContentType: 'password',
  },
  newPassword: {
    secureTextEntry: true,
    autoCapitalize: 'none',
    autoCorrect: false,
    autoComplete: 'new-password',
    textContentType: 'newPassword',
  },
  code: {
    keyboardType: 'number-pad',
    inputMode: 'numeric',
    maxLength: 6,
    autoCorrect: false,
    autoComplete: 'one-time-code',
    textContentType: 'oneTimeCode',
  },
  promo: { autoCapitalize: 'characters', autoCorrect: false },
  multiline: { multiline: true, autoCapitalize: 'sentences', textAlignVertical: 'top' },
  number: { keyboardType: 'number-pad', inputMode: 'numeric', autoCorrect: false },
};

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  kind?: TextFieldKind;
  /** The box that comes next: the action key says "Next" and moves there. Without it the key says "Done" and closes the keyboard. */
  nextRef?: React.RefObject<RNTextInput | null>;
  /** Run when the action key is pressed on the last box (Done / Send / Search). */
  onSubmit?: () => void;
}

export const TextField = forwardRef<RNTextInput, TextFieldProps>(function TextField(
  { label, error, style, kind = 'text', nextRef, onSubmit, onSubmitEditing, ...props },
  ref,
) {
  const preset = PRESETS[kind];
  const [revealed, setRevealed] = useState(false);
  const isPassword = kind === 'password' || kind === 'newPassword';
  const multiline = props.multiline ?? preset.multiline;
  const common = {
    placeholderTextColor: Colors.light.muted,
    returnKeyType: multiline ? ('default' as const) : nextRef ? ('next' as const) : ('done' as const),
    submitBehavior: multiline ? ('newline' as const) : nextRef ? ('submit' as const) : ('blurAndSubmit' as const),
    onSubmitEditing: (e: Parameters<NonNullable<TextInputProps['onSubmitEditing']>>[0]) => {
      onSubmitEditing?.(e);
      if (nextRef) nextRef.current?.focus();
      else onSubmit?.();
    },
    accessibilityLabel: label,
    ...preset,
    ...props,
  };
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {isPassword ? (
        <View style={[styles.input, styles.passwordRow, error && styles.inputError]}>
          <TextInput ref={ref} {...common} secureTextEntry={!revealed} style={[styles.passwordInput, style]} />
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            style={styles.eye}>
            <Text style={styles.eyeText}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>
      ) : (
        <TextInput ref={ref} {...common} style={[styles.input, error && styles.inputError, style]} />
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.card,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 0 },
  passwordInput: { flex: 1, fontSize: 15, color: Colors.light.text, padding: 0, height: '100%' },
  // the Show / Hide button: 44 wide and the full height of the box
  eye: { minWidth: 56, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  eyeText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  inputError: { borderColor: Colors.light.destructive },
  error: { fontSize: 14, color: Colors.light.destructive },
});
