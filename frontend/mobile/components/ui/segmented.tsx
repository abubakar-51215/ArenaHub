import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Shadow } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from .m-seg / .m-seg button / .m-seg button.is-on.
interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.button, active && styles.active]}>
            <Text style={[styles.label, { color: active ? Colors.light.text : Colors.light.muted }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 3,
    backgroundColor: Colors.light.lineSoft,
    borderRadius: 11,
    padding: 3,
  },
  button: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  active: { backgroundColor: Colors.light.card, ...Shadow.segmentActive },
  label: { fontSize: 14, fontWeight: '600' },
});
