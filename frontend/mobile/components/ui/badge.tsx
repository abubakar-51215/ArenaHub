import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from .badge / .badge::before / .b-ok / .b-wait / .b-off / .b-idle.
export type BadgeStatus = 'ok' | 'wait' | 'off' | 'idle';

const STATUS: Record<BadgeStatus, { bg: string; color: string }> = {
  ok: { bg: Colors.light.limeWash, color: Colors.light.limeText },
  wait: { bg: Colors.light.amberWash, color: Colors.light.amberText },
  off: { bg: Colors.light.redWash, color: Colors.light.redText },
  idle: { bg: Colors.light.lineSoft, color: Colors.light.muted },
};

export function Badge({ label, status }: { label: string; status: BadgeStatus }) {
  const s = STATUS[status];
  return (
    <View style={[styles.base, { backgroundColor: s.bg }]}>
      <View style={[styles.dot, { backgroundColor: s.color }]} />
      <Text style={[styles.label, { color: s.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2.5,
    paddingHorizontal: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  label: { fontSize: 11.5, fontWeight: '600', lineHeight: 11.5 * 1.45 },
});
