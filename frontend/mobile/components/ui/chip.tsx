import { Pressable, StyleSheet, type PressableProps } from 'react-native';

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
    <Pressable
      {...props}
      // A filter chip is a togglable choice, not a navigation link or a
      // momentary action — "button" would announce it like the latter.
      accessibilityRole="togglebutton"
      accessibilityState={{ selected: !!active }}
      style={[styles.base, active && styles.active]}>
      {icon}
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
  label: { fontSize: 14, fontWeight: '600' },
});
