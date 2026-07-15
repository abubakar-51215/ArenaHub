import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useQuery } from "@tanstack/react-query";

import { ArenaCard } from "@/components/arena-card";
import { Colors } from "@/constants/theme";
import { useArenaSearch } from "@/hooks/useArenas";
import { getRecommendations } from "@/services/ai";
import { getTrendingArenas } from "@/services/arenas";
import { useAuthStore } from "@/store/auth";
import { useLocationStore, type LocationStatus } from "@/store/location";

const SPORTS = ["All", "futsal", "cricket", "padel", "badminton", "tennis"];

const LOCATION_LABEL: Record<LocationStatus, string> = {
  idle: "Detect my location",
  detecting: "Detecting…",
  detected: "", // replaced by the city name
  denied: "Location permission denied",
  outside: "Outside supported cities",
};

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const { city, status, detect } = useLocationStore();

  useEffect(() => {
    // One-shot auto-detect on first mount; the pill re-triggers it manually.
    if (status === "idle") detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const popular = useArenaSearch({ sort: "rating_desc", page_size: 10 });
  const recommended = useQuery({
    queryKey: ["recommendations", city],
    queryFn: () => getRecommendations({ city: city ?? undefined, limit: 8 }),
  });
  // Ranked by booking volume in the last 7 days (server falls back to
  // rating-ranked popular arenas when nothing was booked in the window).
  const trending = useQuery({
    queryKey: ["trending-arenas", city],
    queryFn: () => getTrendingArenas({ days: 7, city: city ?? undefined, limit: 8 }),
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerTopRow}>
                <View>
                  <Text style={styles.greeting}>
                    Hi {user?.full_name?.split(" ")[0] ?? "there"} 👋
                  </Text>
                  <Text style={styles.subtitle}>
                    Find your arena, book and play!
                  </Text>
                  <Pressable style={styles.locationPill} onPress={detect}>
                    <Ionicons
                      name={city ? "location" : "location-outline"}
                      size={13}
                      color={city ? Colors.light.tint : Colors.light.muted}
                    />
                    <Text
                      style={[
                        styles.locationText,
                        city && styles.locationTextActive,
                      ]}
                    >
                      {city ?? LOCATION_LABEL[status]}
                    </Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => router.push("/notifications")}>
                  <Ionicons
                    name="notifications-outline"
                    size={24}
                    color={Colors.light.text}
                  />
                </Pressable>
              </View>

              <Pressable
                style={styles.searchBar}
                onPress={() => router.push("/(tabs)/search")}
              >
                <Ionicons name="search" size={18} color={Colors.light.muted} />
                <Text style={styles.searchPlaceholder}>
                  Search arenas or locations
                </Text>
              </Pressable>

              <FlatList
                data={SPORTS}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(s) => s}
                contentContainerStyle={styles.sportsRow}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.sportChip}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/search",
                        params: item === "All" ? {} : { sport: item },
                      })
                    }
                  >
                    <Text style={styles.sportChipText}>{item}</Text>
                  </Pressable>
                )}
              />

              {trending.data?.items.length ? (
                <>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="flame" size={16} color={Colors.light.warning} />
                    <Text style={styles.sectionTitle}>Trending Now</Text>
                  </View>
                  <FlatList
                    data={trending.data.items}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(a) => a.id}
                    contentContainerStyle={styles.recommendedRow}
                    renderItem={({ item }) => (
                      <ArenaCard arena={item} width={160} />
                    )}
                  />
                </>
              ) : null}

              {recommended.data?.items.length ? (
                <>
                  <Text style={styles.sectionTitle}>Recommended for You</Text>
                  <FlatList
                    data={recommended.data.items}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(a) => a.id}
                    contentContainerStyle={styles.recommendedRow}
                    renderItem={({ item }) => (
                      <ArenaCard arena={item} width={160} />
                    )}
                  />
                </>
              ) : null}

              <Text style={styles.sectionTitle}>Popular Arenas</Text>
            </View>
          </>
        }
        data={popular.data?.items ?? []}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ArenaCard arena={item} />
          </View>
        )}
        ListEmptyComponent={
          popular.isLoading ? (
            <ActivityIndicator
              style={{ marginTop: 24 }}
              color={Colors.light.tint}
            />
          ) : (
            <Text style={styles.empty}>No arenas yet — check back soon.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  greeting: { fontSize: 22, fontWeight: "700", color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4 },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  locationText: { fontSize: 12, color: Colors.light.muted },
  locationTextActive: { color: Colors.light.tint, fontWeight: "600" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.light.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 14,
  },
  searchPlaceholder: { color: Colors.light.muted, fontSize: 14 },
  sportsRow: { gap: 8, paddingBottom: 16 },
  sportChip: {
    backgroundColor: Colors.light.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sportChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.text,
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.light.text,
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: -4,
  },
  recommendedRow: { gap: 12, paddingBottom: 20 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  empty: { color: Colors.light.muted, textAlign: "center", marginTop: 24 },
});
