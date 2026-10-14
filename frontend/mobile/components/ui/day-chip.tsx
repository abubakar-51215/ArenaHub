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
    <Pressable
      {...props}
      // Unified with SlotPill (same single-select-from-a-set pattern): a
      // radio, not a tab — a tab switches views, this picks one value from
      // a visible set. The radiogroup wrapper belongs at the call site
      // (the view that maps a week of DayChips — none exists yet, DayChip
      // isn't wired into a screen in this diff), not added here speculatively.
      accessibilityRole="radio"
      accessibilityState={{ checked: !!active }}
      style={[styles.base, active && styles.active]}>
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
  weekday: { fontSize: 12, letterSpacing: 0.08 * 12, textTransform: 'uppercase' },
  day: { fontSize: 16, fontWeight: '700', lineHeight: 16 * 1.2 },
});
