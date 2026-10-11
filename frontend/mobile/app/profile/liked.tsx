import { ScreenLoader } from "@/components/brand/screen-loader";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from '@/components/ui/text';
import { SafeAreaView } from "react-native-safe-area-context";

import { ArenaCard } from "@/components/arena-card";
import { Colors } from "@/constants/theme";
import { listLikedArenas } from "@/services/arenas";

export default function LikedArenasScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["liked-arenas"],
    queryFn: listLikedArenas,
  });

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={11} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Liked Arenas</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <ScreenLoader />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(a) => a.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ArenaCard arena={item} />
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No liked arenas yet — tap the heart on any arena to save it here.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: Colors.light.text },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  empty: {
    textAlign: "center",
    color: Colors.light.muted,
    marginTop: 32,
    paddingHorizontal: 24,
  },
});
