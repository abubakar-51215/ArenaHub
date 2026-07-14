import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useMatch } from '@/hooks/useMatches';
import { ApiError } from '@/lib/api';
import { cancelMatch, joinMatch, leaveMatch } from '@/services/matches';
import { useAuthStore } from '@/store/auth';
import type { MatchParticipant } from '@/types';

const STATUS_LABEL = { open: 'Open', full: 'Full', cancelled: 'Cancelled', completed: 'Completed' } as const;

export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: match, isLoading } = useMatch(matchId);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['match', matchId] });
    queryClient.invalidateQueries({ queryKey: ['open-matches'] });
    queryClient.invalidateQueries({ queryKey: ['my-matches'] });
  };

  const joinMutation = useMutation({
    mutationFn: () => joinMatch(matchId as string),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not join.'),
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveMatch(matchId as string),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not leave.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMatch(matchId as string),
    onSuccess: () => {
      invalidate();
      router.back();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not cancel.'),
  });

  if (isLoading || !match) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  const isCreator = currentUser?.id === match.creator_id;
  const isParticipant = match.participants.some((p) => p.player_id === currentUser?.id);
  const canJoin = match.status === 'open' && !isParticipant;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Match Details</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sport}>{match.sport}</Text>
          <Text style={styles.arenaName}>
            {match.arena_name} · {match.court_name}
          </Text>
          <Text style={styles.meta}>{match.city}</Text>
          <Text style={styles.meta}>
            {match.match_date} · {match.start_time.slice(0, 5)}–{match.end_time.slice(0, 5)}
          </Text>
          <Text style={styles.meta}>Organized by {match.creator_name}</Text>
          <View style={styles.statusRow}>
            <Text style={styles.players}>
              {match.players_joined} / {match.max_players} Players
            </Text>
            <Text style={styles.status}>{STATUS_LABEL[match.status]}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Participants</Text>
        <FlatList
          data={match.participants}
          keyExtractor={(p: MatchParticipant) => p.player_id}
          renderItem={({ item }) => (
            <View style={styles.participantRow}>
              <Ionicons name="person-circle-outline" size={22} color={Colors.light.muted} />
              <Text style={styles.participantName}>{item.player_name}</Text>
              {item.player_id === match.creator_id ? <Text style={styles.hostTag}>Host</Text> : null}
            </View>
          )}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        {isCreator ? (
          <Button
            title="Cancel Match"
            variant="outline"
            loading={cancelMutation.isPending}
            onPress={() =>
              Alert.alert('Cancel this match?', 'This cancels it for everyone who joined.', [
                { text: 'Keep match', style: 'cancel' },
                { text: 'Cancel match', style: 'destructive', onPress: () => cancelMutation.mutate() },
              ])
            }
          />
        ) : isParticipant ? (
          <Button
            title="Leave Match"
            variant="outline"
            loading={leaveMutation.isPending}
            onPress={() => leaveMutation.mutate()}
          />
        ) : canJoin ? (
          <Button title="Join Match" loading={joinMutation.isPending} onPress={() => joinMutation.mutate()} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  content: { flex: 1, paddingHorizontal: 20 },
  card: { backgroundColor: Colors.light.card, borderRadius: 12, padding: 14, gap: 4, marginBottom: 16 },
  sport: { fontSize: 18, fontWeight: '700', color: Colors.light.text, textTransform: 'capitalize' },
  arenaName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  meta: { fontSize: 12, color: Colors.light.muted },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  players: { fontSize: 13, fontWeight: '700', color: Colors.light.tint },
  status: { fontSize: 12, fontWeight: '700', color: Colors.light.text, textTransform: 'capitalize' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginBottom: 10 },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  participantName: { fontSize: 14, color: Colors.light.text, flex: 1 },
  hostTag: { fontSize: 11, fontWeight: '700', color: Colors.light.tint },
  errorText: { color: Colors.light.destructive, fontSize: 13, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
});
