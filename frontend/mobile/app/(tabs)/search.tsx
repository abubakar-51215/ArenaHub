import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaCard } from '@/components/arena-card';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { useArenaSearch } from '@/hooks/useArenas';
import { ARENA_CITIES, type ArenaCity } from '@/types';

const SPORTS = ['futsal', 'cricket', 'padel', 'badminton', 'tennis'];
type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'rating_desc';
const SORTS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'rating_desc', label: 'Top Rated' },
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ sport?: string }>();
  const [q, setQ] = useState('');
  const [city, setCity] = useState<ArenaCity | undefined>(undefined);
  const [sport, setSport] = useState<string | undefined>(params.sport);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');

  const searchParams = useMemo(
    () => ({
      q: q.trim() || undefined,
      city,
      sport,
      price_min: priceMin ? Number(priceMin) : undefined,
      price_max: priceMax ? Number(priceMax) : undefined,
      sort,
      page_size: 30,
    }),
    [q, city, sport, priceMin, priceMax, sort],
  );

  const results = useArenaSearch(searchParams);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextField
          placeholder="Search arenas or locations"
          value={q}
          onChangeText={setQ}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        <FilterGroup label="City">
          {ARENA_CITIES.map((c) => (
            <Chip key={c} label={c} active={city === c} onPress={() => setCity(city === c ? undefined : c)} />
          ))}
        </FilterGroup>
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        <FilterGroup label="Sport">
          {SPORTS.map((s) => (
            <Chip key={s} label={s} active={sport === s} onPress={() => setSport(sport === s ? undefined : s)} />
          ))}
        </FilterGroup>
      </ScrollView>

      <View style={styles.priceRow}>
        <TextField
          style={styles.priceInput}
          placeholder="Min price"
          keyboardType="number-pad"
          value={priceMin}
          onChangeText={setPriceMin}
        />
        <Text style={styles.priceDash}>—</Text>
        <TextField
          style={styles.priceInput}
          placeholder="Max price"
          keyboardType="number-pad"
          value={priceMax}
          onChangeText={setPriceMax}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        {SORTS.map((s) => (
          <Chip key={s.value} label={s.label} active={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </ScrollView>

      <FlatList
        data={results.data?.items ?? []}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ArenaCard arena={item} />
          </View>
        )}
        ListHeaderComponent={
          results.data ? (
            <Text style={styles.resultCount}>{results.data.total} results</Text>
          ) : null
        }
        ListEmptyComponent={
          results.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={Colors.light.tint} />
          ) : (
            <Text style={styles.empty}>No arenas match your filters.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}:</Text>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  filterBar: { flexGrow: 0, marginTop: 10 },
  filterBarContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterGroup: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600', color: Colors.light.muted },
  chip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  chipText: { fontSize: 12, color: Colors.light.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 10 },
  priceInput: { flex: 1 },
  priceDash: { color: Colors.light.muted },
  resultCount: { fontSize: 12, color: Colors.light.muted, marginBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  empty: { color: Colors.light.muted, textAlign: 'center', marginTop: 24 },
});
