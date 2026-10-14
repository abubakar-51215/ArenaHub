import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { CourtArt } from '@/components/ui/court-art';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state-view';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useMatch } from '@/hooks/useMatches';
import { ApiError } from '@/lib/api';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { hasStarted } from '@/lib/karachi';
import { matchPill, matchWhen, priceEach } from '@/lib/match-ui';
import { cancelMatch, joinMatch, leaveMatch } from '@/services/matches';
import { sportLabel } from '@/constants/sports';
import { formatRs } from '@/lib/money';
import { useAuthStore } from '@/store/auth';
import { dotJoin } from '@/lib/text';

// Match detail, from arena-hub-player-app-play.html (frames 14 to 22): the arena, when, court, how many players and "about X
// each" (text only), the players with the host marked, the host's note, and one button for what I can do: Join, Leave, Cancel,
// or a plain line when the match is full, cancelled or already started. Nothing is paid in the app.
export default function MatchDetailScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const q = useMatch(matchId);
  const [sheet, setSheet] = useState<'leave' | 'cancel' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const m = q.data;

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['match', matchId] });
    qc.invalidateQueries({ queryKey: ['open-matches'] });
    qc.invalidateQueries({ queryKey: ['my-matches'] });
  }, [qc, matchId]);

  const join = useMutation({
    mutationFn: () => joinMatch(matchId),
    onSuccess: () => {
      successHaptic();
      showToast('You joined the match');
      refresh();
    },
    onError: (err) => {
      errorHaptic();
      const message = err instanceof ApiError ? err.message : '';
      showToast(err instanceof ApiError && err.status === 409 && /full/i.test(message) ? 'Sorry, that match just filled up.' : message || 'Could not join. Please try again.');
      refresh();
    },
  });
  const leave = useMutation({
    mutationFn: () => leaveMatch(matchId),
    onSuccess: () => {
      setSheet(null);
      showToast('You left the match');
      refresh();
    },
    onError: () => showToast('Could not leave. Please try again.'),
  });
  const cancel = useMutation({
    mutationFn: () => cancelMatch(matchId),
    onSuccess: () => {
      setSheet(null);
      showToast('Match cancelled');
      refresh();
    },
    onError: () => showToast('Could not cancel. Please try again.'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  if (q.isLoading) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Match" />
        <View style={{ padding: 18, gap: 12 }}>
          <Skeleton height={130} radius={18} />
          <Skeleton height={14} width="60%" radius={7} />
          <Skeleton height={14} width="40%" radius={7} />
        </View>
      </SafeAreaView>
    );
  }
  if (q.isError || !m) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Match" />
        <ErrorState title={gone ? 'This match is not available.' : 'Could not load this match.'} text={gone ? 'It may have been removed.' : undefined} onRetry={() => q.refetch()} />
      </SafeAreaView>
    );
  }

  const host = m.creator_id === me?.id;
  const live = m.status === 'open' || m.status === 'full';
  const started = hasStarted(m.match_date, m.start_time);
  const pill = matchPill(m, me?.id);
  const price = priceEach(m.booking_total, m.max_players);
  const others = Math.max(0, m.players_joined - 1);

  let action: { title: string; variant?: 'lime' | 'ghost' | 'off'; onPress?: () => void; loading?: boolean; disabled?: boolean; offlineLabel?: string };
  if (m.status === 'cancelled') action = { title: 'This match was cancelled', variant: 'off', disabled: true };
  else if (host && live) action = { title: 'Cancel match', variant: 'ghost', onPress: () => setSheet('cancel') };
  else if (m.joined_by_me && live) action = { title: 'Leave match', variant: 'ghost', onPress: () => setSheet('leave') };
  else if (!live || started) action = { title: started ? 'This match has started' : 'This match is over', variant: 'off', disabled: true };
  else if (m.status === 'full') action = { title: 'Match is full', variant: 'off', disabled: true };
  else action = { title: 'Join match', variant: 'lime', onPress: () => !join.isPending && join.mutate(), loading: join.isPending, offlineLabel: 'Join needs a connection' };

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Match" />
      <ScrollView
        contentContainerStyle={styles.pad}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}>
        <View style={styles.card}>
          <View style={styles.art}>
            <CourtArt sport={m.sport} />
          </View>
          <View style={styles.info}>
            <View style={styles.titleRow}>
              <Text variant="archivo" style={styles.title} accessibilityRole="header">
                {m.arena_name}
              </Text>
              <StatusPill label={pill.label} tone={pill.tone} />
            </View>
            <Text style={styles.sub}>{m.city}</Text>
            <View style={styles.rows}>
              <Row label="When" value={matchWhen(m)} />
              <Row label="Court" value={dotJoin([m.court_name, sportLabel(m.sport)])} />
              <Row label="Players" value={`${m.players_joined} / ${m.max_players}`} />
              {price ? <Row label="Share" value={price} /> : null}
            </View>
          </View>
        </View>

        <Text style={styles.label} accessibilityRole="header">
          Players
        </Text>
        <View style={styles.card}>
          {m.participants.map((p, i) => (
            <View key={p.player_id} style={[styles.player, i < m.participants.length - 1 && styles.playerLine]}>
              <View style={styles.avatar}>
                <Icon name="user" size={16} color={Colors.light.text2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.playerName}>
                  {p.player_name}
                  {p.player_id === me?.id ? <Text style={styles.you}> · You</Text> : null}
                </Text>
                {p.player_id === m.creator_id ? <Text style={styles.host}>Host</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.noteText}>
          {m.note ? `${m.note} ` : ''}{m.booking_total ? `The booking costs ${formatRs(m.booking_total)}; the share above is only a guess. ` : ''}You settle it with each other. No payment happens in the app.
        </Text>
      </ScrollView>

      <StickyBar>
        <Button title={action.title} variant={action.variant} loading={action.loading} disabled={action.disabled} offlineLabel={action.offlineLabel} onPress={action.onPress} />
      </StickyBar>

      <ConfirmSheet
        visible={sheet === 'leave'}
        title="Leave this match?"
        message="Your place will open for someone else."
        confirmLabel="Yes, leave match"
        loading={leave.isPending}
        stacked
        onConfirm={() => !leave.isPending && leave.mutate()}
        onCancel={() => !leave.isPending && setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === 'cancel'}
        title="Cancel this match?"
        message={`${others > 0 ? `The ${others} ${others === 1 ? 'player who joined' : 'players who joined'} will be told. ` : ''}Your court booking stays as it is.`}
        confirmLabel="Yes, cancel match"
        loading={cancel.isPending}
        stacked
        onConfirm={() => !cancel.isPending && cancel.mutate()}
        onCancel={() => !cancel.isPending && setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 18, overflow: 'hidden' },
  art: { height: 120 },
  info: { padding: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, color: Colors.light.text },
  sub: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  rows: { marginTop: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, color: Colors.light.muted },
  rowValue: { flexShrink: 1, fontSize: 14, color: Colors.light.text, textAlign: 'right' },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 18, marginBottom: 8 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  playerLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  avatar: { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  playerName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  you: { fontWeight: '500', color: Colors.light.muted },
  host: { fontSize: 14, color: Colors.light.muted },
  noteText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 16 },
});
