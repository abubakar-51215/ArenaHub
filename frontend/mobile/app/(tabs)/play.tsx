import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/match-card';
import { Colors } from '@/constants/theme';
import { useMyMatches, useOpenMatches } from '@/hooks/useMatches';
import { ApiError } from '@/lib/api';
import { joinMatch } from '@/services/matches';
import type { Match } from '@/types';

const SPORTS = ['futsal', 'cricket', 'padel', 'badminton', 'tennis'];

export default function PlayScreen() {
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [sport, setSport] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const queryClient = useQueryClient();

  const openParams = useMemo(() => ({ sport, page_size: 30 }), [sport]);
  const open = useOpenMatches(openParams);
  const mine = useMyMatches();

  const joinMutation = useMutation({
    mutationFn: (matchId: string) => joinMatch(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-matches'] });
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
    onError: (err) =>
      Alert.alert('Could not join', err instanceof ApiError ? err.message : 'Please try again.'),
  });

  const isLoading = tab === 'open' ? open.isLoading : mine.isLoading;
  const openItems = open.data?.items ?? [];
  const myItems = mine.data ? [...mine.data.created, ...mine.data.joined] : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Matchmaking</Text>
        <Pressable onPress={() => setShowFilters((s) => !s)}>
          <Ionicons name="filter-outline" size={22} color={Colors.light.text} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Find players. Join matches. Play together!</Text>
      </View>

      <View style={styles.tabs}>
        {(['open', 'mine'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'open' ? 'Open Matches' : 'My Matches'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'open' && showFilters ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterBarContent}>
          {SPORTS.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, sport === s && styles.chipActive]}
              onPress={() => setSport(sport === s ? undefined : s)}>
              <Text style={[styles.chipText, sport === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={tab === 'open' ? openItems : myItems}
          keyExtractor={(m: Match) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            tab === 'open' ? (
              <MatchCard
                match={item}
                joining={joinMutation.isPending && joinMutation.variables === item.id}
                onJoin={(match) => joinMutation.mutate(match.id)}
              />
            ) : (
              <MatchCard match={item} showStatus />
            )
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'open' ? 'No open matches right now.' : "You haven't created or joined any matches yet."}
            </Text>
          }
        />
      )}

      <View style={styles.footer}>
        <Button title="Create a Match" onPress={() => router.push('/play/create')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  hero: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.light.card,
  },
  heroTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.light.card,
  },
  tabActive: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  tabTextActive: { color: '#fff' },
  filterBar: { flexGrow: 0, marginBottom: 8 },
  filterBarContent: { paddingHorizontal: 20, gap: 8 },
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
  list: { paddingHorizontal: 20, paddingBottom: 12 },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 32 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
});
