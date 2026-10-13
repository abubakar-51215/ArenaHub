import { useState } from 'react';
import { StyleSheet, View, type TextInput as RNTextInput } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { CountBadge } from '@/components/ui/count-badge';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { Colors } from '@/constants/theme';
import { TapBox } from '@/components/ui/tap-box';

/** The search field and the Filters button (with its count badge) of the Search frames. */
export function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onFilters,
  filterCount,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  /** Left out on the Filters screen itself: no Filters button there. */
  onFilters?: () => void;
  filterCount?: number;
  autoFocus?: boolean;
  inputRef?: React.Ref<RNTextInput>;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.row}>
      <View style={[styles.field, focused && styles.focused]}>
        <Icon name="search" size={15} color={Colors.light.muted} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Try “cheap futsal in Lahore”"
          placeholderTextColor={Colors.light.muted}
          returnKeyType="search"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          enterKeyHint="search"
          autoFocus={autoFocus}
          accessibilityLabel="Search arenas"
          style={styles.input}
        />
        {value ? (
          <TapBox onPress={() => onChangeText('')} slop={18} accessibilityRole="button" accessibilityLabel="Clear search text">
            <Text style={styles.clear}>✕</Text>
          </TapBox>
        ) : null}
      </View>
      {onFilters ? (
      <PressableScale
        onPress={onFilters}
        accessibilityRole="button"
        accessibilityLabel={filterCount ? `Filters, ${filterCount} applied` : 'Filters'}>
        <View style={styles.filters}>
          {/* the sliders icon drawn in the frames */}
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={Colors.light.text} strokeWidth={1.9} strokeLinecap="round">
            <Path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <Circle cx={16} cy={7} r={2} />
            <Circle cx={8} cy={17} r={2} />
          </Svg>
          <CountBadge count={filterCount ?? 0} />
        </View>
      </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    borderRadius: 12,
  },
  focused: { borderColor: Colors.light.limeDeep },
  input: { flex: 1, fontSize: 14, color: Colors.light.text, padding: 0, outlineStyle: 'none' } as object,
  clear: { fontSize: 14, color: Colors.light.muted },
  filters: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
