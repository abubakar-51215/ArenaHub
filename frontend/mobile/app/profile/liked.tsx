import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaImage } from '@/components/ui/arena-image';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { HeartButton } from '@/components/venue';
import { formatRs } from '@/lib/money';
import { listLikedArenas } from '@/services/arenas';
import type { Arena } from '@/types';

// Saved arenas, from arena-hub-player-app-account.html (frames 12 and 13): a row per arena with its picture, where it is
// and the price from, a heart to un-save it, and an empty state that leads to the search. The heart is a separate
// button next to the row (a button never sits inside a button).
function SavedRow({ arena }: { arena: Arena }) {
  return (
    <View style={styles.card}>
      <PressableScale
        style={styles.main}
        contentStyle={styles.mainContent}
        onPress={() => router.push(`/arena/${arena.id}` as unknown as Href)}
        accessibilityRole="button"
        accessibilityLabel={`${arena.name}, ${arena.area ?? arena.city}`}>
        <ArenaImage photo={arena.images[0]} sport={arena.sports_offered[0]} style={styles.pic} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {arena.name}
          </Text>
          <Text style={styles.where} numberOfLines={1}>
            {[arena.area, arena.city].filter(Boolean).join(', ')}
          </Text>
        </View>
        {arena.min_price != null ? <Text style={styles.price}>{formatRs(arena.min_price)}</Text> : null}
      </PressableScale>
      <View style={styles.heart}>
        <HeartButton arenaId={arena.id} />
      </View>
    </View>
  );
}

export default function SavedArenasScreen() {
  const q = useQuery({ queryKey: ['liked-arenas'], queryFn: listLikedArenas, retry: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Saved arenas" />
      {q.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.card}>
              <View style={[styles.mainContent, { flex: 1 }]}>
                <Skeleton width={60} height={60} radius={12} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton height={14} width="60%" radius={7} />
                  <Skeleton height={14} width="40%" radius={7} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : q.isError && !q.data ? (
        <ErrorState title="Could not load your saved arenas." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <SavedRow arena={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="heart" size={30} color={Colors.light.limeDeep} />}
              title="No saved arenas."
              text="Tap the heart on an arena to keep it here."
              buttonTitle="Find an arena"
              onButton={() => router.push('/(tabs)/search' as unknown as Href)}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, marginBottom: 10, overflow: 'hidden' },
  main: { flex: 1 },
  mainContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 80 },
  pic: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  where: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  heart: { width: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.ink, alignSelf: 'stretch' },
});
