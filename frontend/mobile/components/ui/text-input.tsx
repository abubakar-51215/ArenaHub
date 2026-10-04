import { forwardRef } from 'react';
import { StyleSheet, TextInput as RNTextInput, type TextInputProps, type TextStyle } from 'react-native';

import { BodyLetterSpacing, Font } from '@/constants/theme';

// Same weight-to-face mapping as components/ui/text.tsx (see that file for
// why fontWeight can't be left on a custom-named font family, and why the
// mapping is a numeric threshold rather than a lookup table). RN's TextInput
// has one `style` prop for both the typed value and the placeholder (there
// is no separate placeholder font style), so resolving the family here
// covers both automatically.
function normalizeWeight(fontWeight: TextStyle['fontWeight']): number {
  if (fontWeight == null) return 400;
  if (fontWeight === 'normal') return 400;
  if (fontWeight === 'bold') return 700;
  const n = Number(fontWeight);
  return Number.isFinite(n) ? n : 400;
}

function bodyFace(weight: number): string {
  if (weight >= 650) return Font.bodyBold;
  if (weight >= 550) return Font.bodySemi;
  if (weight >= 450) return Font.bodyMedium;
  return Font.body;
}

// forwardRef so components/ui/field.tsx (G0c-2b-fix) can reach the
// underlying RNTextInput — needed for G1's autofocus-first-field and
// return-key-moves-to-next-field, neither of which works without a ref to
// call .focus() on.
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontFamily: explicitFamily, fontWeight, letterSpacing, ...restStyle } = flat;

  const fontFamily = explicitFamily ?? bodyFace(normalizeWeight(fontWeight));
  const resolvedLetterSpacing = letterSpacing ?? BodyLetterSpacing;

  return (
    <RNTextInput
      ref={ref}
      style={[restStyle, { fontFamily, letterSpacing: resolvedLetterSpacing }]}
      {...rest}
    />
  );
});
