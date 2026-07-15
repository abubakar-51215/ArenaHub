import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ArenaCard } from "@/components/arena-card";
import { TextField } from "@/components/ui/text-field";
import { Colors } from "@/constants/theme";
import { useArenaSearch } from "@/hooks/useArenas";
import { nlpSearch } from "@/services/ai";
import { useLocationStore } from "@/store/location";
import { useSearchHistory } from "@/store/search-history";
import { ARENA_CITIES, type ArenaCity } from "@/types";

const SPORTS = ["futsal", "cricket", "padel", "badminton", "tennis"];
type SortOption = "newest" | "price_asc" | "price_desc" | "rating_desc";
const SORTS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating_desc", label: "Top Rated" },
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ sport?: string }>();
  const location = useLocationStore();
  const [q, setQ] = useState("");
  const [city, setCity] = useState<ArenaCity | undefined>(undefined);

  async function useMyLocation() {
    // Fresh detection each tap — the user may have moved since app launch.
    await location.detect();
    const detected = useLocationStore.getState().city;
    if (detected) setCity(detected);
  }
  const [sport, setSport] = useState<string | undefined>(params.sport);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

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

  const structuredResults = useArenaSearch(searchParams);
  const nlpResults = useQuery({
    queryKey: ["nlp-search", q],
    queryFn: () => nlpSearch(q.trim()),
    enabled: q.trim().length > 0,
  });

  const useNlp = q.trim().length > 0;
  const items = useNlp ? nlpResults.data?.items : structuredResults.data?.items;
  const total = useNlp ? nlpResults.data?.total : structuredResults.data?.total;
  const isLoading = useNlp ? nlpResults.isLoading : structuredResults.isLoading;
  const parsed = nlpResults.data?.parsed;

  const history = useSearchHistory();
  useEffect(() => {
    // Record a query once it has actually produced results — keeps typos
    // and half-typed prefixes out of the recent list.
    if (useNlp && nlpResults.data && nlpResults.data.total > 0) {
      history.add(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nlpResults.data]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TextField
          placeholder='Try "cheap futsal in Lahore"'
          value={q}
          onChangeText={setQ}
        />
        {useNlp && parsed && !parsed.used_fallback_text_search ? (
          <View style={styles.parsedRow}>
            <Text style={styles.parsedLabel}>Understood:</Text>
            {parsed.sport ? (
              <Text style={styles.parsedChip}>{parsed.sport}</Text>
            ) : null}
            {parsed.city ? (
              <Text style={styles.parsedChip}>{parsed.city}</Text>
            ) : null}
            {parsed.sort !== "newest" ? (
              <Text style={styles.parsedChip}>
                {SORTS.find((s) => s.value === parsed.sort)?.label}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {!useNlp && history.recent.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}
        >
          <FilterGroup label="Recent">
            {history.recent.map((recentQuery) => (
              <Chip
                key={recentQuery}
                label={`🕐 ${recentQuery}`}
                active={false}
                onPress={() => setQ(recentQuery)}
              />
            ))}
            <Pressable onPress={history.clear} hitSlop={8}>
              <Ionicons name="close-circle-outline" size={18} color={Colors.light.muted} />
            </Pressable>
          </FilterGroup>
        </ScrollView>
      ) : null}

      {!useNlp ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
            contentContainerStyle={styles.filterBarContent}
          >
            <FilterGroup label="City">
              <Chip
                label={
                  location.status === "detecting" ? "Locating…" : "📍 Near me"
                }
                active={!!city && city === location.city}
                onPress={useMyLocation}
              />
              {ARENA_CITIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={city === c}
                  onPress={() => setCity(city === c ? undefined : c)}
                />
              ))}
            </FilterGroup>
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
            contentContainerStyle={styles.filterBarContent}
          >
            <FilterGroup label="Sport">
              {SPORTS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={sport === s}
                  onPress={() => setSport(sport === s ? undefined : s)}
                />
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterBar}
            contentContainerStyle={styles.filterBarContent}
          >
            {SORTS.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                active={sort === s.value}
                onPress={() => setSort(s.value)}
              />
            ))}
          </ScrollView>
        </>
      ) : null}

      <FlatList
        data={items ?? []}
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
          total !== undefined ? (
            <Text style={styles.resultCount}>{total} results</Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator
              style={{ marginTop: 24 }}
              color={Colors.light.tint}
            />
          ) : (
            <Text style={styles.empty}>No arenas match your filters.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.filterGroup}>
      <Text style={styles.filterLabel}>{label}:</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  title: { fontSize: 20, fontWeight: "700", color: Colors.light.text },
  parsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  parsedLabel: { fontSize: 12, color: Colors.light.muted },
  parsedChip: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.tint,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: "capitalize",
  },
  filterBar: { flexGrow: 0, marginTop: 10 },
  filterBarContent: { paddingHorizontal: 20, gap: 8, alignItems: "center" },
  filterGroup: { flexDirection: "row", gap: 8, alignItems: "center" },
  filterLabel: { fontSize: 12, fontWeight: "600", color: Colors.light.muted },
  chip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipText: {
    fontSize: 12,
    color: Colors.light.text,
    textTransform: "capitalize",
  },
  chipTextActive: { color: "#fff", fontWeight: "600" },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  priceInput: { flex: 1 },
  priceDash: { color: Colors.light.muted },
  resultCount: { fontSize: 12, color: Colors.light.muted, marginBottom: 8 },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  empty: { color: Colors.light.muted, textAlign: "center", marginTop: 24 },
});
