import { createContext, useContext } from 'react';
import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

import { BodyLetterSpacing, Font } from '@/constants/theme';

export type TextVariant = 'body' | 'archivo';

export interface AppTextProps extends TextProps {
  /** 'archivo' maps fontWeight onto the Archivo roles instead of Inter Tight. */
  variant?: TextVariant;
}

// Marks "this node is already inside one of our Text components" so a nested
// <Text>child</Text> with no weight/family of its own can inherit the
// parent's face instead of snapping to Regular — matching native RN Text's
// own inheritance (a plain nested <Text> inherits its parent's font). Without
// this, `<Text style={bold}>Total: <Text>₨ 1,200</Text></Text>` would render
// the inner span Regular even though native Text renders it Bold.
const InheritedFamily = createContext<string | null>(null);

// React Native does not honour `fontWeight` on a custom-named font family —
// each weight is its own family file (constants/theme.ts Font), so asking
// for `fontFamily: 'InterTight_400Regular', fontWeight: '600'` just renders
// regular weight (native) or a synthetic/double bold (web). Every screen
// written before this wrapper existed still sets fontWeight the normal way,
// so rather than hand-fixing every call site now (a per-screen content
// change, out of scope here), this maps the weight it asked for onto the
// right static face and strips fontWeight from what actually reaches the
// platform.
//
// The mapping is a numeric threshold, not a lookup table keyed by the exact
// string seen in the codebase: an unlisted weight (e.g. '800', '300', '900')
// must still round to the nearest face in the right direction — silently
// falling back to Regular would turn bold text invisible-weight, the worse
// failure. 650 is the platform limit logged in docs/RESTYLE_LOG.md ("Weight
// 650"): Inter Tight 650 measures pixel-identical to 700 in the prototype, so
// it rounds to Bold rather than a face that doesn't exist.
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

function archivoFace(weight: number): string {
  // Only two Archivo weights are loaded (app/_layout.tsx): 600 and 700. 650
  // is the same platform limit as above, applied to the other family.
  return weight >= 650 ? Font.display : Font.eyebrow;
}

export function Text({ style, variant = 'body', ...rest }: AppTextProps) {
  const inherited = useContext(InheritedFamily);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontFamily: explicitFamily, fontWeight, letterSpacing, ...restStyle } = flat;

  // Nothing in this node asked for a specific look: let it inherit, exactly
  // like a plain nested RN <Text> would.
  if (explicitFamily == null && fontWeight == null && inherited != null) {
    return (
      <RNText style={[restStyle, { fontFamily: inherited }]} {...rest} />
    );
  }

  const fontFamily =
    explicitFamily ??
    (variant === 'archivo' ? archivoFace(normalizeWeight(fontWeight)) : bodyFace(normalizeWeight(fontWeight)));

  const resolvedLetterSpacing =
    letterSpacing ?? (variant === 'body' ? BodyLetterSpacing : undefined);

  return (
    <InheritedFamily.Provider value={fontFamily}>
      <RNText
        style={[restStyle, { fontFamily }, resolvedLetterSpacing != null && { letterSpacing: resolvedLetterSpacing }]}
        {...rest}
      />
    </InheritedFamily.Provider>
  );
}
