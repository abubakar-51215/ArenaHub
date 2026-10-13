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
  /** A link at the right end of the box (Change). At least 44 high. */
  action?: { label: string; onPress: () => void };
  /** A grey line under the box. */
  hint?: string;
}

/**
 * The labelled text box of the account frames: label above (14, semi-bold), a 52 high box with a 1.5 px line, an ink
 * border and a soft lime ring while it has focus, a red border with a message under it on error, and a Show/Hide
 * link for passwords.
 */
export const TextField = forwardRef<RNTextInput, TextFieldProps>(function TextField(
  { label, error, style, kind = 'text', nextRef, onSubmit, onSubmitEditing, action, hint, editable, onFocus, onBlur, ...props },
  ref,
) {
  const preset = PRESETS[kind];
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = kind === 'password' || kind === 'newPassword';
  const multiline = props.multiline ?? preset.multiline;
  const common = {
    placeholderTextColor: '#8B958F',
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
    editable,
    onFocus: (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
      setFocused(true);
      onFocus?.(e);
    },
    onBlur: (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
      setFocused(false);
      onBlur?.(e);
    },
  };
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, multiline && styles.boxMulti, focused && !error && styles.focused, !!error && styles.boxError, editable === false && styles.boxOff]}>
        <TextInput
          ref={ref}
          {...common}
          secureTextEntry={isPassword ? !revealed : props.secureTextEntry}
          style={[styles.input, multiline && styles.inputMulti, style]}
        />
        {isPassword ? (
          <Pressable onPress={() => setRevealed((r) => !r)} accessibilityRole="button" accessibilityLabel={revealed ? 'Hide password' : 'Show password'} style={styles.link}>
            <Text style={styles.linkText}>{revealed ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={`${action.label} ${label ?? ''}`.trim()} style={styles.link}>
            <Text style={styles.linkText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingLeft: 13, paddingRight: 4, backgroundColor: Colors.light.card, borderWidth: 1.5, borderColor: Colors.light.line, borderRadius: 15 },
  boxMulti: { alignItems: 'flex-start', paddingTop: 8, paddingRight: 13 },
  focused: { borderColor: Colors.light.ink, boxShadow: '0 0 0 3px rgba(196,245,70,0.45)' },
  boxError: { borderColor: Colors.light.destructive },
  boxOff: { backgroundColor: Colors.light.lineSoft },
  input: { flex: 1, minHeight: 48, fontSize: 14, color: Colors.light.text, padding: 0, outlineStyle: 'none' } as object,
  inputMulti: { minHeight: 96, textAlignVertical: 'top' },
  link: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  linkText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeText },
  error: { fontSize: 14, lineHeight: 20, color: Colors.light.redText },
  hint: { fontSize: 14, lineHeight: 20, color: Colors.light.muted },
});
