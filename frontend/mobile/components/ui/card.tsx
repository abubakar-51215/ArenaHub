import { StyleSheet, View, type ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';

// Values from .m-card. Just the outer container — the image fallback inside
// (.m-vis) is ArenaImage's job (G0c-2c).
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.line,
    borderRadius: 15,
    overflow: 'hidden',
  },
});
