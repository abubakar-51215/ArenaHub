import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search/search-bar';
import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { ErrorCopy } from '@/components/ui/state-view';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { VenueRow } from '@/components/venue';
import { Colors } from '@/constants/theme';
import { useResults } from '@/hooks/useResults';
import type { ChipKind } from '@/services/ai';
import { IconExtra } from '@/components/ui/icon-extra';
import { useAuthStore } from '@/store/auth';
import { useLocationStore } from '@/store/location';
import { useSearchHistory } from '@/store/search-history';
import { activeFilterCount, useSearchFilters, type SortChoice } from '@/store/search-filters';
import { TapBox } from '@/components/ui/tap-box';

// Results (frames 5 and 6): the field with its clear mark, Filters with a
// count, the count, the Best / Price / Rating switch and the rows. "No arenas
// found" has Clear filters, which clears the filters and the text.
// Smart search (arena-hub-player-app-smart.html): words the server understood
// show as "We understood:" chips, each with x to remove that part (frames 1
// and 2); the rows say the free slots at the asked time; nothing matching says
// so with "Remove price" / "Remove time" where they apply (frame 3). Words it
// did not understand are matched against arena names, with a note (frame 4).
const SORTS: { label: string; value: SortChoice }[] = [
  { label: 'Best', value: 'best' },
  { label: 'Price', value: 'price_asc' },
  { label: 'Rating', value: 'rating_desc' },
];

export default function ResultsScreen() {
  const f = useSearchFilters();
  const history = useSearchHistory();
  // the chips the player removed, for these words only (new words start again)
  const [dropped, setDropped] = useState<{ q: string; kinds: ChipKind[] }>({ q: '', kinds: [] });
  const typed = f.q.trim();
  const drop = dropped.q === typed ? dropped.kinds : [];
  const remove = (kind: ChipKind) => setDropped({ q: typed, kinds: [...drop, kind] });
  const r = useResults({ drop });
  const coords = useLocationStore((s) => s.coords);
  const status = useLocationStore((s) => s.status);
  const detect = useLocationStore((s) => s.detect);
  const savedCity = useAuthStore((s) => s.user?.preferred_locations?.[0]);
  // asked for distance (Near me or a radius) but there is no position: say why, calmly
  const wantsDistance = f.sort === 'near' || !!f.radiusKm;
  const noPosition = wantsDistance && !coords;
  const where = savedCity ?? 'all cities';
  const turnOn = async () => {
    await detect();
    if (useLocationStore.getState().status === 'denied') Linking.openSettings().catch(() => {});
  };

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title={typed ? 'Search' : f.title ?? 'Results'} />
      <KeyboardScroll contentContainerStyle={styles.pad}>
        <SearchBar
          value={f.q}
          onChangeText={f.setQ}
          onSubmit={() => f.q.trim() && history.add(f.q.trim())}
          onFilters={() => router.push({ pathname: '/filters', params: { from: 'results' } } as unknown as Href)}
          filterCount={activeFilterCount(f)}
        />

        {r.chips.length ? (
          <View>
            <Text style={styles.understood}>We understood:</Text>
            <View style={styles.chips}>
              {r.chips.map((c) => (
                <View key={c.kind} style={styles.chip}>
                  <Text style={styles.chipText}>{c.label}</Text>
                  <TapBox onPress={() => remove(c.kind)} slop={12} inner={styles.chipXBox} accessibilityRole="button" accessibilityLabel={`Remove ${c.label}`}>
                    <Text style={styles.chipX}>×</Text>
                  </TapBox>
                </View>
              ))}
            </View>
          </View>
        ) : typed && r.parsed?.used_fallback_text_search ? (
          <Text style={styles.plainNote}>Showing arenas that match &quot;{typed}&quot;.</Text>
        ) : null}

        {noPosition && status !== 'detecting' ? (
          <View style={styles.banner} accessibilityRole="alert">
            <IconExtra name="locate" size={20} color={Colors.light.limeDeep} />
            <Text style={styles.bannerText}>
              {status === 'unavailable' || status === 'outside' ? `We could not find your location. Showing arenas in ${where}. You can try again from Filters.` : `Location is off. Showing arenas in ${where}.`}
            </Text>
            {status === 'unavailable' || status === 'outside' ? null : (
              <Pressable onPress={turnOn} accessibilityRole="button" accessibilityLabel="Turn on location" style={styles.bannerLink}>
                <Text style={styles.bannerLinkText}>Turn on</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {r.isError ? (
          <View style={styles.center}>
            <View style={{ marginBottom: 10 }}>
              <BrandMark mode="offline" size={72} />
            </View>
            <ErrorCopy title="Could not load arenas" titleStyle={styles.centerTitle} textStyle={styles.centerText} />
            <View style={styles.centerButton}>
              <Button title="Try again" onPress={() => r.query.refetch()} />
            </View>
          </View>
        ) : !r.isLoading && r.items.length === 0 && r.understood ? (
          <NothingMatches kinds={r.chips.map((c) => c.kind)} onRemove={remove} />
        ) : !r.isLoading && r.items.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyIcon}>
              <Icon name="search" size={26} color={Colors.light.text2} />
            </View>
            <Text variant="archivo" style={styles.centerTitle}>
              No arenas found
            </Text>
            <Text style={styles.centerText}>{'Try a different sport or area,\nor clear some filters.'}</Text>
            <View style={styles.centerButton}>
              <Button title="Clear filters" variant="ghost" onPress={f.clearAll} />
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.countRow, r.understood && styles.hiddenRow]}>
              {r.isLoading ? (
                <Skeleton width={90} height={14} radius={6} />
              ) : (
                <Text style={styles.count} accessibilityLiveRegion="polite">
                  {r.total} {r.total === 1 ? 'arena' : 'arenas'}
                  {coords && f.radiusKm ? ` within ${f.radiusKm} km` : ''}
                </Text>
              )}
              <View style={styles.seg} accessibilityRole="radiogroup">
                {(coords ? [...SORTS, { label: 'Near me', value: 'near' as SortChoice }] : SORTS).map((s) => {
                  const on = r.sort === s.value;
                  return (
                    <TapBox
                      key={s.value}
                      onPress={() => f.setSort(s.value)}
                      slop={{ y: 7 }}
                      inner={[styles.segBtn, on && styles.segOn]}
                      accessibilityRole="radio"
                      accessibilityLabel={`Sort by ${s.label}`}
                      accessibilityState={{ checked: on }}
                      aria-checked={on}>
                      <Text style={[styles.segText, on && styles.segTextOn]}>{s.label}</Text>
                    </TapBox>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 10 }}>
              {r.isLoading
                ? [0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.skRow}>
                      <Skeleton width={60} height={52} radius={10} />
                      <View style={{ flex: 1 }}>
                        <Skeleton width="70%" height={12} radius={6} />
                        <View style={{ height: 8 }} />
                        <Skeleton width="50%" height={10} radius={6} />
                      </View>
                    </View>
                  ))
                : r.items.map((a) => <VenueRow key={a.id} arena={a} note={a.free_slots_text} />)}
            </View>
          </>
        )}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

/** Frame 3: what was understood stays above; a way out for the price and the time, where they were understood. */
function NothingMatches({ kinds, onRemove }: { kinds: ChipKind[]; onRemove: (k: ChipKind) => void }) {
  const price = kinds.includes('price');
  const time = kinds.includes('time');
  const hint = price && time ? 'Try removing the price or the time.' : price ? 'Try removing the price.' : time ? 'Try removing the time.' : null;
  return (
    <View style={styles.nothing}>
      <Text variant="archivo" style={styles.nothingTitle} accessibilityRole="header">
        No arena matches all of that.
      </Text>
      {hint ? <Text style={styles.nothingText}>{hint}</Text> : null}
      <View style={styles.nothingButtons}>
        {price ? <Button title="Remove price" variant="ghost" onPress={() => onRemove('price')} /> : null}
        {time ? <Button title="Remove time" variant="ghost" onPress={() => onRemove('time')} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plainNote: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 12 },
  chipX: { fontSize: 15, fontWeight: '700', color: Colors.light.limeText },
  // a 20px drawn x in a real 44px tap box (TapBox adds 12 on every side), ending at the chip's own edge
  chipXBox: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  hiddenRow: { display: 'none' },
  nothing: { alignItems: 'center', paddingTop: 36, gap: 6 },
  nothingTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  nothingText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, textAlign: 'center' },
  nothingButtons: { alignSelf: 'stretch', gap: 10, marginTop: 14 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.light.limeWash, borderColor: '#D9EBA0', borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 12 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.light.noteText },
  bannerLink: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  bannerLinkText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeText },
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 28 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  understood: { fontSize: 14, color: Colors.light.muted, marginTop: 14 },
  // .chip of the smart frames: a lime-wash pill with its x
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.light.limeWash, borderColor: '#D9EBA0', borderWidth: 1, borderRadius: 999, minHeight: 36, paddingLeft: 12, paddingRight: 12 },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.light.limeText },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8, minHeight: 34 },
  count: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  seg: { flexDirection: 'row', gap: 3, backgroundColor: Colors.light.lineSoft, borderRadius: 11, padding: 3 },
  segBtn: { minHeight: 30, paddingHorizontal: 9, borderRadius: 9, justifyContent: 'center' },
  segOn: { backgroundColor: Colors.light.card },
  segText: { fontSize: 14, fontWeight: '600', color: Colors.light.muted },
  segTextOn: { color: Colors.light.text },
  skRow: { flexDirection: 'row', gap: 10, padding: 9, backgroundColor: Colors.light.card, borderRadius: 15, borderColor: Colors.light.line, borderWidth: 1 },
  center: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  centerTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  centerText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 18, textAlign: 'center' },
  centerButton: { width: 200 },
});
