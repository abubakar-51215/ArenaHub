import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from .m-chip / .m-chip.is-on (arena-hub-player-app.html).
interface ChipProps extends Omit<PressableProps, 'style'> {
  label: string;
  active?: boolean;
  icon?: React.ReactNode;
}

export function Chip({ label, active, icon, ...props }: ChipProps) {
  return (
    <Pressable {...props} style={[styles.base, active && styles.active]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={[styles.label, { color: active ? Colors.light.paper : Colors.light.text2 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderWidth: 1,
    borderColor: Colors.light.line,
    minWidth: 58,
  },
  active: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  // .m-chip.is-on svg { color: var(--lime) } — the icon, not the label text.
  icon: {},
  label: { fontSize: 10.5, fontWeight: '600' },
});
