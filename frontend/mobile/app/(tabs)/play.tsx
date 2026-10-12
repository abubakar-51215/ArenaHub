import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchCard } from '@/components/g6/match-card';
import { Button } from '@/components/ui/button';
import { IconExtra } from '@/components/ui/icon-extra';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useMyMatches, useOpenMatches } from '@/hooks/useMatches';
import { useAuthStore } from '@/store/auth';
import type { ArenaCity, Match } from '@/types';

// Matchmaking, from arena-hub-player-app-play.html (frames 06 to 10): "Short a player?" with Post a match, Open matches and
// My matches, a card per match, and empty / loading / error states. Open matches are the ones in the player's saved city (until
// the near-me search covers matches too). A match is always on one of the creator's own booked games.
type Tab = 'open' | 'mine';
const post = () => router.push('/play/create' as unknown as Href);

function SkeletonCard() {
  return (
    <View style={styles.skCard}>
      <Skeleton height={14} width="55%" radius={7} />
      <Skeleton height={14} width="70%" radius={7} />
      <Skeleton height={14} width="85%" radius={7} />
    </View>
  );
}

export default function PlayScreen() {
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('open');
  const [refreshing, setRefreshing] = useState(false);
  const city = me?.preferred_locations?.[0] as ArenaCity | undefined;

  const params = useMemo(() => ({ city, page_size: 30 }), [city]);
  const open = useOpenMatches(params);
  const mine = useMyMatches();
  const q = tab === 'open' ? open : mine;

  const items: Match[] = useMemo(() => {
    if (tab === 'open') return open.data?.items ?? [];
    if (!mine.data) return [];
    const all = [...mine.data.created, ...mine.data.joined];
    return all.sort((a, b) => (a.match_date + a.start_time < b.match_date + b.start_time ? 1 : -1));
  }, [tab, open.data, mine.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <Text variant="archivo" style={styles.title} accessibilityRole="header">
        Play
      </Text>
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text variant="archivo" style={styles.heroTitle}>
            Short a player?
          </Text>
          <Text style={styles.heroText}>Post your booked game. Others can join.</Text>
        </View>
        <View style={{ minWidth: 126 }}>
          <Button title="Post a match" variant="lime" onPress={post} />
        </View>
      </View>
      <View style={styles.seg}>
        <Segmented
          options={[
            { value: 'open', label: 'Open matches' },
            { value: 'mine', label: 'My matches' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {q.isLoading ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError && !q.data ? (
        <ErrorState title="Could not load matches." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MatchCard match={item} myId={me?.id} showPill={tab === 'mine'} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            tab === 'open' ? (
              <EmptyState
                icon={<IconExtra name="people" size={30} color={Colors.light.limeDeep} />}
                title="No open matches."
                text="Be the first. Post a match for a game you have booked."
                buttonTitle="Post a match"
                onButton={post}
              />
            ) : (
              <EmptyState icon={<IconExtra name="people" size={30} color={Colors.light.limeDeep} />} title="No matches yet." text="Matches you post or join will show up here." />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.75, color: Colors.light.text, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 18, backgroundColor: Colors.light.ink, borderRadius: 18, padding: 16, marginBottom: 12 },
  heroTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  heroText: { fontSize: 14, lineHeight: 20, color: '#A9B5AE', marginTop: 4 },
  seg: { paddingHorizontal: 18, paddingBottom: 10 },
  list: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24, flexGrow: 1 },
  skCard: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 14, gap: 10, marginBottom: 10 },
});
