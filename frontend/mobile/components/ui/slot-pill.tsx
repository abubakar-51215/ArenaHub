import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Colors } from '@/constants/theme';
import { Text } from '@/components/ui/text';

// Values from .slot-pill / .slot-pill small / .is-on / .is-gone / .is-deal.
// The prototype defines a 4th state, `is-deal` (a highlighted discounted
// slot) alongside open/selected/taken — included here since it's real
// prototype CSS, not invented.
export type SlotPillState = 'open' | 'selected' | 'taken' | 'deal';

interface SlotPillProps extends Omit<PressableProps, 'style'> {
  label: string;
  sublabel?: string;
  state?: SlotPillState;
}

export function SlotPill({ label, sublabel, state = 'open', ...props }: SlotPillProps) {
  const disabled = state === 'taken';
  return (
    <Pressable
      {...props}
      disabled={disabled || props.disabled}
      style={[
        styles.base,
        state === 'selected' && styles.selected,
        state === 'taken' && styles.taken,
        state === 'deal' && styles.deal,
      ]}>
      <Text
        style={[
          styles.label,
          state === 'taken' && styles.takenText,
          { color: state === 'selected' ? Colors.light.paper : state === 'taken' ? Colors.light.muted : Colors.light.text },
        ]}>
        {label}
      </Text>
      {sublabel ? (
        <Text
          style={[
            styles.sublabel,
            state === 'taken' && styles.takenText,
            {
              color:
                state === 'selected' || state === 'deal'
                  ? state === 'selected'
                    ? Colors.light.lime
                    : Colors.light.limeDeep
                  : Colors.light.muted,
            },
          ]}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.line,
    backgroundColor: Colors.light.card,
    alignItems: 'center',
  },
  selected: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  taken: { backgroundColor: Colors.light.slotOpen, borderStyle: 'dashed' },
  deal: { borderColor: Colors.light.limeDeep, backgroundColor: Colors.light.limeWash },
  label: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
  sublabel: { fontSize: 9, fontWeight: '500', marginTop: 2 },
  takenText: { textDecorationLine: 'line-through' },
});
