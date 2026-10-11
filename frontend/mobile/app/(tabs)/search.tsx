import { router, type Href } from 'expo-router';
import { StyleSheet, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchBar } from '@/components/search/search-bar';
import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { SPORTS } from '@/constants/sports';
import { activeFilterCount, useSearchFilters } from '@/store/search-filters';
import { useSearchHistory } from '@/store/search-history';

// Search (frame 4): the field, a Filters button with its count, Recent
// searches (hidden when there are none; 8 at most, with Clear) and Browse by
// sport. Everything leads to the Results screen.
const toResults = () => router.push('/results' as unknown as Href);

export default function SearchScreen() {
  const f = useSearchFilters();
  const history = useSearchHistory();

  const run = (text: string) => {
    history.add(text);
    f.setQ(text);
    toResults();
  };

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Search" back={false} />
      <KeyboardScroll contentContainerStyle={styles.pad}>
        <SearchBar
          value={f.q}
          onChangeText={f.setQ}
          onSubmit={() => f.q.trim() && run(f.q.trim())}
          onFilters={() => router.push({ pathname: '/filters', params: { from: 'search' } } as unknown as Href)}
          filterCount={activeFilterCount(f)}
        />

        {history.recent.length ? (
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.eyebrow} accessibilityRole="header">
                Recent searches
              </Text>
              <Pressable onPress={history.clear} hitSlop={14} accessibilityRole="button" accessibilityLabel="Clear recent searches">
                <Text style={styles.clear}>Clear</Text>
              </Pressable>
            </View>
            {history.recent.map((t) => (
              <PressableScale key={t} onPress={() => run(t)} accessibilityRole="button" accessibilityLabel={`Search ${t}`}>
                <View style={styles.row}>
                  <View style={styles.ico}>
                    <Icon name="search" size={16} color={Colors.light.text2} />
                  </View>
                  <Text style={styles.rowText}>{t}</Text>
                  <View style={styles.chev}>
                    <Icon name="chev" size={15} color={Colors.light.muted} />
                  </View>
                </View>
              </PressableScale>
            ))}
          </View>
        ) : null}

        <Text style={[styles.eyebrow, { marginTop: 22, marginBottom: 10 }]} accessibilityRole="header">
          Browse by sport
        </Text>
        <View style={styles.tags}>
          {SPORTS.map((s) => (
            <PressableScale
              key={s.value}
              onPress={() => {
                f.open({ sport: s.value });
                toResults();
              }}
              accessibilityRole="button"
              accessibilityLabel={s.label}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{s.label}</Text>
              </View>
            </PressableScale>
          ))}
        </View>
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 28 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 4 },
  // uppercase labels are exempt from the 14px rule
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted },
  clear: { fontSize: 14, fontWeight: '600', color: Colors.light.limeDeep },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  ico: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 14, color: Colors.light.text },
  chev: { marginLeft: 'auto' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 6, backgroundColor: Colors.light.lineSoft },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
});
