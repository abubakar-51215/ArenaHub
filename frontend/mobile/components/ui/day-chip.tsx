import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from .m-day / .m-day span / .m-day b / .m-day.is-on.
interface DayChipProps extends Omit<PressableProps, 'style'> {
  weekday: string;
  day: string | number;
  active?: boolean;
}

export function DayChip({ weekday, day, active, ...props }: DayChipProps) {
  return (
    <Pressable {...props} style={[styles.base, active && styles.active]}>
      <Text style={[styles.weekday, { color: active ? Colors.light.lime : Colors.light.muted }]}>{weekday}</Text>
      <Text
        variant="archivo"
        style={[styles.day, { color: active ? Colors.light.paper : Colors.light.text }]}>
        {day}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    paddingVertical: 8,
    borderRadius: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.light.line,
    backgroundColor: Colors.light.card,
  },
  active: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  weekday: { fontSize: 9, letterSpacing: 0.08 * 9, textTransform: 'uppercase' },
  day: { fontSize: 16, fontWeight: '700', lineHeight: 16 * 1.2 },
});
