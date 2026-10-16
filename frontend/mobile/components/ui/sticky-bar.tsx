import { StyleSheet, View, type ViewProps } from 'react-native';

import { Colors } from '@/constants/theme';

// Values from .m-sticky.
export function StickyBar({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.base, style]} />;
}

const styles = StyleSheet.create({
  base: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: Colors.light.paper,
    borderTopWidth: 1,
    borderTopColor: Colors.light.line,
    gap: 9,
  },
});
