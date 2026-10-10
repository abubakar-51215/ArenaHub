import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search/search-bar';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RangeSlider } from '@/components/ui/range-slider';
import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { useResults } from '@/hooks/useResults';
import { PRICE_MAX, PRICE_MIN, useSearchFilters } from '@/store/search-filters';
import { ARENA_CITIES } from '@/types';

// Filters (the prototype's "Search & filters" frame), pushed from the Filters
// button. Kept: the field, Where (city), Sport and the two-thumb price slider.
// Left out for now, no backend behind them: the radius, time of day and "Must
// have" rows (logged in docs/MOBILE_REQUIREMENTS.md).
function Tag({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }}>
      <View style={[styles.tag, on && styles.tagOn]}>
        <Text style={[styles.tagText, on && styles.tagTextOn]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

export default function FiltersScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const f = useSearchFilters();
  const r = useResults({ pageSize: 1 });

  const show = () => {
    if (from === 'search') router.replace('/results' as unknown as Href);
    else router.back();
  };

  return (
    <GestureHandlerRootView style={styles.page}>
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead
          title="Filters"
          right={
            <Pressable onPress={f.clearAll} hitSlop={14} accessibilityRole="button" accessibilityLabel="Clear all filters">
              <Text style={styles.clear}>Clear all</Text>
            </Pressable>
          }
        />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pad}>
          <SearchBar value={f.q} onChangeText={f.setQ} onSubmit={() => {}} />

          <Text style={styles.eyebrow} accessibilityRole="header">
            Where
          </Text>
          <View style={styles.tags}>
            {ARENA_CITIES.map((c) => (
              <Tag key={c} label={c} on={f.city === c} onPress={() => f.setCity(f.city === c ? undefined : c)} />
            ))}
          </View>

          <Text style={styles.eyebrow} accessibilityRole="header">
            Sport
          </Text>
          <View style={styles.tags}>
            {SPORTS.map((s) => (
              <Tag key={s.value} label={s.label} on={f.sport === s.value} onPress={() => f.setSport(f.sport === s.value ? undefined : s.value)} />
            ))}
          </View>

          <Text style={styles.eyebrow} accessibilityRole="header">
            Price per hour
          </Text>
          <RangeSlider
            min={PRICE_MIN}
            max={PRICE_MAX}
            step={100}
            low={f.priceMin}
            high={f.priceMax}
            onChange={f.setPrice}
            topLabel={(v) => `₨ ${v.toLocaleString('en-PK')}+`}
          />
        </ScrollView>
        <View style={styles.sticky}>
          <Button title={r.isLoading ? 'Show arenas' : `Show ${r.total} ${r.total === 1 ? 'arena' : 'arenas'}`} onPress={show} />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  clear: { fontSize: 14, fontWeight: '600', color: Colors.light.limeDeep },
  // uppercase labels are exempt from the 14px rule
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 6, backgroundColor: Colors.light.lineSoft },
  tagOn: { backgroundColor: Colors.light.ink },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  tagTextOn: { color: Colors.light.paper },
  sticky: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.light.line, backgroundColor: Colors.light.paper },
});
