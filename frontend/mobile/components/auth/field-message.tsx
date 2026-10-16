import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';

/** .field-err / .field-hint: 11px, under a field. */
export function FieldMessage({ children, kind = 'error' }: { children: string; kind?: 'error' | 'hint' }) {
  return (
    <Text style={[styles.base, kind === 'error' ? styles.error : styles.hint]} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { fontSize: 14, paddingHorizontal: 2, marginTop: -4 },
  error: { color: Colors.light.redText },
  hint: { color: Colors.light.muted },
});
