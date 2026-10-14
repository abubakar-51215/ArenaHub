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

const LABEL_COLOR: Record<SlotPillState, string> = {
  open: Colors.light.text,
  selected: Colors.light.paper,
  taken: Colors.light.muted,
  deal: Colors.light.text,
};

const SUBLABEL_COLOR: Record<SlotPillState, string> = {
  open: Colors.light.muted,
  selected: Colors.light.lime,
  taken: Colors.light.muted,
  deal: Colors.light.limeDeep,
};

export function SlotPill({ label, sublabel, state = 'open', ...props }: SlotPillProps) {
  const taken = state === 'taken';
  return (
    <Pressable
      {...props}
      disabled={taken || props.disabled}
      // Unified with DayChip (same single-select-from-a-set pattern). The
      // radiogroup wrapper belongs at each call site — the view that maps
      // the slot-grid (app/court/[id]/slots.tsx, app/booking/reschedule/
      // [bookingId].tsx) — not added here speculatively.
      accessibilityRole="radio"
      accessibilityState={{ checked: state === 'selected', disabled: taken }}
      style={[
        styles.base,
        state === 'selected' && styles.selected,
        taken && styles.taken,
        state === 'deal' && styles.deal,
      ]}>
      <Text style={[styles.label, taken && styles.takenText, { color: LABEL_COLOR[state] }]}>{label}</Text>
      {sublabel ? (
        <Text style={[styles.sublabel, taken && styles.takenText, { color: SUBLABEL_COLOR[state] }]}>
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
  label: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  sublabel: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  takenText: { textDecorationLine: 'line-through' },
});
