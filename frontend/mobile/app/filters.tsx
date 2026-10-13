import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search/search-bar';
import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { Button } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RangeSlider } from '@/components/ui/range-slider';
import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { useResults } from '@/hooks/useResults';
import { useLocationStore } from '@/store/location';
import { PRICE_MAX, PRICE_MIN, RADIUS_CHOICES, useSearchFilters, type SortChoice } from '@/store/search-filters';
import { ARENA_CITIES } from '@/types';
import { TapBox } from '@/components/ui/tap-box';

// Filters (the prototype's "Search & filters" frame), pushed from the Filters
// button. Kept: the field, Where (city), Sport and the two-thumb price slider.
// Sort by (with Near me) and How far (1, 3, 5, 10 km, Any) are in the near-me frames; both need the player's location.
// Left out for now, no backend behind them: time of day and "Must have" rows (logged in docs/MOBILE_REQUIREMENTS.md).
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
  const coords = useLocationStore((s) => s.coords);
  const detect = useLocationStore((s) => s.detect);
  // Near me and a distance need the player's position: tapping one asks for it (the system asks, with a 6 second limit)
  const needLocation = async (then: () => void) => {
    if (!coords) await detect();
    if (useLocationStore.getState().coords) then();
  };

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
            <TapBox onPress={f.clearAll} slop={14} accessibilityRole="button" accessibilityLabel="Clear all filters">
              <Text style={styles.clear}>Clear all</Text>
            </TapBox>
          }
        />
        <KeyboardScroll contentContainerStyle={styles.pad}>
          <SearchBar value={f.q} onChangeText={f.setQ} onSubmit={() => {}} />

          <Text style={styles.eyebrow} accessibilityRole="header">
            Sort by
          </Text>
          <View style={styles.tags}>
            {([['Best', 'best'], ['Near me', 'near'], ['Price', 'price_asc'], ['Newest', 'newest']] as [string, SortChoice][]).map(([label, value]) => (
              <Tag
                key={value}
                label={label}
                on={f.sort === value && (value !== 'near' || !!coords)}
                onPress={() => (value === 'near' ? needLocation(() => f.setSort('near')) : f.setSort(value))}
              />
            ))}
          </View>

          <Text style={styles.eyebrow} accessibilityRole="header">
            How far
          </Text>
          <View style={styles.tags}>
            {RADIUS_CHOICES.map((km) => (
              <Tag key={km} label={`${km} km`} on={!!coords && f.radiusKm === km} onPress={() => needLocation(() => f.setRadius(f.radiusKm === km ? null : km))} />
            ))}
            <Tag label="Any" on={!f.radiusKm} onPress={() => f.setRadius(null)} />
          </View>
          {!coords ? <Text style={styles.hint}>Needs your location.</Text> : null}

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
        </KeyboardScroll>
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
  clear: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText },
  // uppercase labels are exempt from the 14px rule
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { fontSize: 14, color: Colors.light.muted, marginTop: 8 },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 6, backgroundColor: Colors.light.lineSoft },
  tagOn: { backgroundColor: Colors.light.ink },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  tagTextOn: { color: Colors.light.paper },
  sticky: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.light.line, backgroundColor: Colors.light.paper },
});
