import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaCard } from '@/components/arena-card';
import { Colors } from '@/constants/theme';
import { useArenaSearch } from '@/hooks/useArenas';
import { useAuthStore } from '@/store/auth';

const SPORTS = ['All', 'futsal', 'cricket', 'padel', 'badminton', 'tennis'];

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const popular = useArenaSearch({ sort: 'rating_desc', page_size: 10 });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.greeting}>Hi {user?.full_name?.split(' ')[0] ?? 'there'} 👋</Text>
              <Text style={styles.subtitle}>Find your arena, book and play!</Text>

              <Pressable style={styles.searchBar} onPress={() => router.push('/(tabs)/search')}>
                <Ionicons name="search" size={18} color={Colors.light.muted} />
                <Text style={styles.searchPlaceholder}>Search arenas or locations</Text>
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
                      router.push({ pathname: '/(tabs)/search', params: item === 'All' ? {} : { sport: item } })
                    }>
                    <Text style={styles.sportChipText}>{item}</Text>
                  </Pressable>
                )}
              />

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
            <ActivityIndicator style={{ marginTop: 24 }} color={Colors.light.tint} />
          ) : (
            <Text style={styles.empty}>No arenas yet — check back soon.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  greeting: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
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
  sportChipText: { fontSize: 13, fontWeight: '600', color: Colors.light.text, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginBottom: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  empty: { color: Colors.light.muted, textAlign: 'center', marginTop: 24 },
});
