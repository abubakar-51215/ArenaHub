import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from design/prototypes/arena-hub-player-app.html .m-btn / .ghost /
// .lime (the CSS rules themselves, not the instance-measured table — those
// rows capture one call site's override, not the class's own declared
// style). The prototype has no `outline` variant; existing `outline` call
// sites are repointed to `ghost`, the closest match (secondary, unfilled).
export type ButtonVariant = 'ink' | 'ghost' | 'lime';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

const VARIANTS: Record<ButtonVariant, { bg: string; border: string; text: string }> = {
  ink: { bg: Colors.light.ink, border: Colors.light.ink, text: Colors.light.paper },
  ghost: { bg: Colors.light.card, border: Colors.light.line, text: Colors.light.text },
  lime: { bg: Colors.light.lime, border: Colors.light.lime, text: '#0F1A15' },
};

export function Button({ title, variant = 'ink', loading, disabled, ...props }: ButtonProps) {
  const v = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border },
        // Added state, not in the prototype (a static mockup draws no press
        // feedback): opacity 0.9 + scale 0.99, the same minimal, token-free
        // feedback the pre-G0c-2b interim Button used.
        pressed && !isDisabled && styles.pressed,
        // Added state, not in the prototype: opacity 0.5, same reasoning.
        isDisabled && styles.disabled,
      ]}>
      {loading ? (
        // Added state, not in the prototype (a static mockup can't show a
        // spinner; G1's submit flow needs one): the variant's own text colour.
        <View style={styles.loadingRow}>
          <ActivityIndicator color={v.text} />
        </View>
      ) : (
        <Text style={[styles.text, { color: v.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  loadingRow: { height: 20.25 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  text: { fontSize: 13.5, fontWeight: '650' as '600' },
});
