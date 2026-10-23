import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
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
import { FILTER_TEXT, TIMES_OF_DAY } from '@/constants/filters';
import { SPORTS } from '@/constants/sports';
import { useFilterAmenities } from '@/hooks/useArenas';
import { useResults } from '@/hooks/useResults';
import { useLocationStore } from '@/store/location';
import { PRICE_MAX, PRICE_MIN, RADIUS_CHOICES, useSearchFilters, type SortChoice } from '@/store/search-filters';
import { ARENA_CITIES } from '@/types';
import { TapBox } from '@/components/ui/tap-box';

// Filters (the prototype's "Search & filters" frame), pushed from the Filters
// button. Kept: the field, Where (city), Sport and the two-thumb price slider.
// Sort by (with Near me) and How far (2, 5, 10, 25 km, Any) are in the near-me frames; both need the player's location.
// How far is greyed out until the position is known and never asks for it (Near me is the one that asks).
// Time of day and Must have (amenities) are rows of the same chips: a part of the day with a free slot, and the
// amenities an arena must all have.
function Tag({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <PressableScale onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, disabled: !!disabled }}>
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
  const granted = useLocationStore((s) => s.granted);
  const refreshPermission = useLocationStore((s) => s.refreshPermission);
  const amenities = useFilterAmenities();
  // Near me needs the player's position: tapping it asks for it (the system asks, with a 6 second limit).
  // How far does not ask: it only works once the position is known.
  const needLocation = async (then: () => void) => {
    if (!coords) await detect();
    if (useLocationStore.getState().coords) then();
  };
  // finds out (without a dialog) whether location is allowed, so the line under How far says the right thing
  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

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
            {FILTER_TEXT.howFar}
          </Text>
          <View style={[styles.tags, !coords && styles.tagsOff]} accessibilityState={{ disabled: !coords }}>
            {RADIUS_CHOICES.map((km) => (
              <Tag key={km} label={`${km} km`} on={!!coords && f.radiusKm === km} disabled={!coords} onPress={() => f.setRadius(f.radiusKm === km ? null : km)} />
            ))}
            <Tag label={FILTER_TEXT.anyDistance} on={!f.radiusKm} disabled={!coords} onPress={() => f.setRadius(null)} />
          </View>
          {!coords ? <Text style={styles.hint}>{granted === false ? FILTER_TEXT.locationOff : FILTER_TEXT.needsLocation}</Text> : null}

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
            {FILTER_TEXT.timeOfDay}
          </Text>
          <View style={styles.tags}>
            {TIMES_OF_DAY.map((t) => (
              <Tag key={t.value} label={t.label} on={f.timeOfDay === t.value} onPress={() => f.setTimeOfDay(f.timeOfDay === t.value ? undefined : t.value)} />
            ))}
          </View>

          {amenities.data && amenities.data.length > 0 ? (
            <>
              <Text style={styles.eyebrow} accessibilityRole="header">
                {FILTER_TEXT.mustHave}
              </Text>
              <View style={styles.tags}>
                {amenities.data.map((a) => (
                  <Tag key={a.id} label={a.name} on={f.amenityIds.includes(a.id)} onPress={() => f.toggleAmenity(a.id)} />
                ))}
              </View>
            </>
          ) : null}

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
  // a decorative uppercase label: 12px (the floor for micro labels; information text is 14px)
  eyebrow: { fontSize: 12, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagsOff: { opacity: 0.5 },
  hint: { fontSize: 14, color: Colors.light.muted, marginTop: 8 },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 6, backgroundColor: Colors.light.lineSoft },
  tagOn: { backgroundColor: Colors.light.ink },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  tagTextOn: { color: Colors.light.paper },
  sticky: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: Colors.light.line, backgroundColor: Colors.light.paper },
});
