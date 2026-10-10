import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';

// .m-chips / .m-chip of the Home frames: an icon over a small label. The label
// is a label (exempt from the 14px rule); the chip is at least 58 wide and 44 high.
const ICON: Record<string, IconName> = {
  all: 'grid',
  futsal: 'ball',
  cricket: 'bat',
  padel: 'racket',
  badminton: 'shuttle',
  table_tennis: 'racket',
  squash: 'racket',
  basketball: 'ball',
  volleyball: 'ball',
  snooker: 'set',
  tennis: 'racket',
};

export function SportChips({ selected = 'all', onSelect }: { selected?: string; onSelect: (sport: string) => void }) {
  const items = [{ value: 'all', label: 'All' }, ...SPORTS.map((s) => ({ value: s.value as string, label: s.label }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((s) => {
        const on = s.value === selected;
        return (
          <PressableScale
            key={s.value}
            onPress={() => onSelect(s.value)}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            accessibilityState={{ selected: on }}>
            <View style={[styles.chip, on && styles.on]}>
              <Icon name={ICON[s.value] ?? 'ball'} size={17} color={on ? Colors.light.lime : Colors.light.text2} />
              <Text style={[styles.label, on && styles.labelOn]}>{s.label}</Text>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 7, paddingHorizontal: 18, paddingBottom: 2 },
  chip: {
    minWidth: 58,
    minHeight: 44,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
  },
  on: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  label: { fontSize: 10.5, fontWeight: '600', color: Colors.light.text2 },
  labelOn: { color: Colors.light.paper },
});
