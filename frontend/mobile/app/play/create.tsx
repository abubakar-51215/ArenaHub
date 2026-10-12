import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormScreen } from '@/components/g6/form-screen';
import { Button } from '@/components/ui/button';
import { IconExtra } from '@/components/ui/icon-extra';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useMyMatches } from '@/hooks/useMatches';
import { ApiError } from '@/lib/api';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { formatClock, formatDayShort } from '@/lib/karachi';
import { formatRs } from '@/lib/money';
import { priceEach } from '@/lib/match-ui';
import { createMatch } from '@/services/matches';
import { listBookingGroups } from '@/services/bookings';
import type { BookingGroupItem } from '@/types';

// Post a match, from arena-hub-player-app-play.html (frames 11 and 12): pick one of my own upcoming CONFIRMED booked games
// (only those; a booking has one open match), how many more players are needed, an optional note, and the price line. The price
// is text only ("about X each"): nothing is paid in the app. With no booked game there is a button to find an arena.
const MAX_MORE = 29;

export default function PostMatchScreen() {
  const qc = useQueryClient();
  const bookings = useQuery({ queryKey: ['booking-groups', 'upcoming', 'all'], queryFn: () => listBookingGroups('upcoming', 1, 100), retry: 1 });
  const mine = useMyMatches();
  const [picked, setPicked] = useState<string | null>(null);
  const [more, setMore] = useState(4);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // confirmed bookings that do not have an open or full match yet
  const taken = useMemo(() => new Set((mine.data?.created ?? []).filter((m) => m.status === 'open' || m.status === 'full').map((m) => m.booking_group_id)), [mine.data]);
  const games = useMemo(() => (bookings.data?.items ?? []).filter((b) => b.status === 'confirmed' && !taken.has(b.booking_group_id)), [bookings.data, taken]);
  const chosen: BookingGroupItem | undefined = games.find((g) => g.booking_group_id === picked) ?? (games.length === 1 ? games[0] : undefined);
  const price = chosen ? priceEach(chosen.total, more + 1) : null;

  const post = useMutation({
    mutationFn: () => createMatch({ booking_group_id: chosen!.booking_group_id, sport: chosen!.sport ?? 'futsal', max_players: more + 1, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: () => {
      successHaptic();
      qc.invalidateQueries({ queryKey: ['open-matches'] });
      qc.invalidateQueries({ queryKey: ['my-matches'] });
      showToast('Match posted');
      router.replace('/(tabs)/play' as unknown as Href);
    },
    onError: (err) => {
      errorHaptic();
      setError(err instanceof ApiError ? err.message : 'Could not post your match. Please try again.');
    },
  });

  const submit = () => {
    if (post.isPending) return;
    if (!chosen) return setError('Pick one of your booked games.');
    setError(null);
    post.mutate();
  };

  if (bookings.isLoading || mine.isLoading) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Post a match" />
        <View style={{ padding: 18, gap: 10 }}>
          <Skeleton height={64} radius={15} />
          <Skeleton height={64} radius={15} />
        </View>
      </SafeAreaView>
    );
  }
  if ((bookings.isError && !bookings.data) || (mine.isError && !mine.data)) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Post a match" />
        <ErrorState title="Could not load your booked games." onRetry={() => (bookings.isError ? bookings.refetch() : mine.refetch())} />
      </SafeAreaView>
    );
  }
  if (games.length === 0) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Post a match" />
        <EmptyState
          icon={<IconExtra name="bookings" size={30} color={Colors.light.limeDeep} />}
          title="No booked games."
          text="You can post a match after you book a court."
          buttonTitle="Find an arena"
          onButton={() => router.replace('/(tabs)/search' as unknown as Href)}
        />
      </SafeAreaView>
    );
  }

  return (
    <FormScreen title="Post a match" footer={<Button title="Post match" loading={post.isPending} disabled={!chosen} onPress={submit} />}>
      <Text style={styles.intro}>Pick one of your booked games. Players can join until it is full.</Text>
      <Text style={styles.label} accessibilityRole="header">
        Your booked game
      </Text>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {games.map((g) => {
          const on = g.booking_group_id === chosen?.booking_group_id;
          return (
            <Pressable
              key={g.booking_group_id}
              onPress={() => {
                tapHaptic();
                setPicked(g.booking_group_id);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${formatDayShort(g.booking_date)}, ${g.arena_name}, ${formatClock(g.start_time)} to ${formatClock(g.end_time)}, ${g.court_name}`}
              style={[styles.game, on && styles.gameOn]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.gameTitle}>
                  {formatDayShort(g.booking_date)} · {g.arena_name}
                </Text>
                <Text style={styles.gameSub}>
                  {formatClock(g.start_time)} – {formatClock(g.end_time)} · {g.court_name}
                </Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label} accessibilityRole="header">
        Players needed
      </Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => setMore((n) => Math.max(1, n - 1))} accessibilityRole="button" accessibilityLabel="Fewer players" disabled={more <= 1} style={[styles.stepBtn, more <= 1 && { opacity: 0.4 }]}>
          <IconExtra name="minus" size={20} />
        </Pressable>
        <Text variant="archivo" style={styles.stepNum} accessibilityLiveRegion="polite">
          {more}
        </Text>
        <Pressable onPress={() => setMore((n) => Math.min(MAX_MORE, n + 1))} accessibilityRole="button" accessibilityLabel="More players" disabled={more >= MAX_MORE} style={[styles.stepBtn, more >= MAX_MORE && { opacity: 0.4 }]}>
          <IconExtra name="plus" size={20} />
        </Pressable>
        <Text style={styles.stepText}>more {more === 1 ? 'player' : 'players'}</Text>
      </View>

      <TextField label="Note (optional)" kind="multiline" placeholder="Friendly game, all levels." value={note} onChangeText={(t) => setNote(t.slice(0, 200))} maxLength={200} error={error} />

      <View style={styles.note}>
        <Text style={styles.noteText}>
          {chosen && price ? `The booking costs ${formatRs(chosen.total)}. Shared by ${more + 1} players, that is ${price}. ` : ''}You settle it with each other. No payment happens in the app.
        </Text>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  intro: { fontSize: 14, lineHeight: 20, color: Colors.light.muted },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted },
  game: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: Colors.light.card, borderWidth: 1.5, borderColor: Colors.light.line, borderRadius: 15, padding: 14 },
  gameOn: { backgroundColor: Colors.light.limeWash, borderColor: Colors.light.limeDeep },
  gameTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  gameSub: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.light.limeDeep },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.light.limeDeep },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 54, height: 54, borderRadius: 15, backgroundColor: Colors.light.card, borderWidth: 1.5, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  stepNum: { minWidth: 70, textAlign: 'center', fontSize: 24, fontWeight: '700', color: Colors.light.text },
  stepText: { fontSize: 14, color: Colors.light.muted },
  note: { backgroundColor: Colors.light.limeWash, borderWidth: 1, borderColor: Colors.light.limeDeep, borderRadius: 11, padding: 12 },
  noteText: { fontSize: 14, lineHeight: 20, color: Colors.light.noteText },
});
