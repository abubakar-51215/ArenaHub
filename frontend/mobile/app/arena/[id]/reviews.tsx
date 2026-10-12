import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { IconExtra } from '@/components/ui/icon-extra';
import { Icon } from '@/components/ui/icon';
import { KeyboardArea } from '@/components/ui/keyboard-scroll';
import { RatingStar } from '@/components/ui/rating-star';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useArena } from '@/hooks/useArenas';
import { ApiError } from '@/lib/api';
import { errorHaptic, successHaptic, tapHaptic } from '@/lib/haptics';
import { formatDayShort, timeAgo } from '@/lib/karachi';
import { listBookingGroups } from '@/services/bookings';
import { deleteReview, getRatingSummary, listArenaReviews, reportReview, submitReview, updateReview } from '@/services/reviews';
import { useAuthStore } from '@/store/auth';
import type { Review } from '@/types';

// Reviews, from arena-hub-player-app-account.html (frames 17 to 26): the average and the five bars, a card per review (with
// the owner's reply), "Write a review" in a bottom sheet (stars required, text up to 500), my own review has a menu (edit, delete),
// anyone else's can be reported (three reasons). No tag chips. A review can be edited at any time and deleted.
const MAX = 500;
const REASONS = ['Rude or offensive', 'Not about this arena', 'Spam or fake'];
const letter = (name: string) => name.trim()[0]?.toUpperCase() ?? '?';

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <RatingStar key={i} filled={i <= value} size={size} />
      ))}
    </View>
  );
}

function Summary({ average, count, breakdown }: { average: number | null; count: number; breakdown: number[] }) {
  const max = Math.max(1, ...breakdown);
  return (
    <View style={styles.summary}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text variant="archivo" style={styles.avg}>
          {average != null && count > 0 ? average.toFixed(1) : '–'}
        </Text>
        <Stars value={Math.round(average ?? 0)} />
        <Text style={styles.count}>{count} {count === 1 ? 'review' : 'reviews'}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }} accessibilityLabel="Reviews by stars">
        {[5, 4, 3, 2, 1].map((star) => (
          <View key={star} style={styles.barRow}>
            <Text style={styles.barLabel}>{star}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(((breakdown[star - 1] ?? 0) / max) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ReviewCard({ review, mine, onMenu }: { review: Review; mine: boolean; onMenu: (r: Review, mine: boolean) => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{letter(review.reviewer_name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {review.reviewer_name}
            {mine ? <Text style={styles.you}> · you</Text> : null}
          </Text>
          <Text style={styles.when}>{timeAgo(review.created_at)}</Text>
        </View>
        <Pressable onPress={() => onMenu(review, mine)} accessibilityRole="button" accessibilityLabel={mine ? 'Edit or delete your review' : 'Report this review'} style={styles.dots}>
          <Text style={styles.dotsText}>•••</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 8 }}>
        <Stars value={review.rating} />
      </View>
      {review.review_text ? <Text style={styles.text}>{review.review_text}</Text> : null}
      {review.owner_response ? (
        <View style={styles.reply}>
          <Text style={styles.replyTitle}>Reply from the arena</Text>
          <Text style={styles.replyText}>{review.owner_response}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ArenaReviewsScreen() {
  const { id: arenaId, bookingId: bookingParam, editId } = useLocalSearchParams<{ id: string; bookingId?: string; editId?: string }>();
  const listRef = useRef<FlatList<Review>>(null);
  const arena = useArena(arenaId);
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const reviews = useQuery({ queryKey: ['arena-reviews', arenaId], queryFn: () => listArenaReviews(arenaId), enabled: !!arenaId, retry: 1 });
  const summary = useQuery({ queryKey: ['arena-rating', arenaId], queryFn: () => getRatingSummary(arenaId), enabled: !!arenaId, retry: 1 });
  const past = useQuery({ queryKey: ['booking-groups', 'past', 'all'], queryFn: () => listBookingGroups('past', 1, 100), retry: 1 });

  const items = useMemo(() => reviews.data?.items ?? [], [reviews.data]);
  const myReviews = useMemo(() => items.filter((r) => r.player_id === me?.id), [items, me]);
  const reviewedBookings = useMemo(() => new Set(myReviews.map((r) => r.booking_id)), [myReviews]);

  // the game I can write about: the one in the link, or my latest finished game here that has no review yet
  const writeFor = useMemo(() => {
    const groups = (past.data?.items ?? []).filter((g) => g.arena_id === arenaId && g.status === 'completed');
    const pick = bookingParam ? groups.find((g) => g.booking_id === bookingParam) : groups.find((g) => g.my_rating == null && !reviewedBookings.has(g.booking_id));
    if (pick && !reviewedBookings.has(pick.booking_id)) return { bookingId: pick.booking_id, label: `${formatDayShort(pick.booking_date)} · ${pick.court_name}` };
    if (bookingParam && !reviewedBookings.has(bookingParam)) return { bookingId: bookingParam, label: arena.data?.name ?? '' };
    return null;
  }, [past.data, arenaId, bookingParam, reviewedBookings, arena.data]);

  const [sheet, setSheet] = useState<'write' | 'edit' | null>(bookingParam ? 'write' : null);
  const [editing, setEditing] = useState<Review | null>(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ review: Review; mine: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Review | null>(null);
  const [reporting, setReporting] = useState<Review | null>(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['arena-reviews', arenaId] });
    qc.invalidateQueries({ queryKey: ['arena-reviews-preview', arenaId] });
    qc.invalidateQueries({ queryKey: ['arena-rating', arenaId] });
    qc.invalidateQueries({ queryKey: ['my-reviews'] });
    qc.invalidateQueries({ queryKey: ['booking-groups'] });
  }, [qc, arenaId]);

  const post = useMutation({
    mutationFn: async () => {
      const body = text.trim();
      if (editing) return updateReview(editing.id, { rating, review_text: body });
      return submitReview(arenaId, { booking_id: writeFor!.bookingId, rating, ...(body ? { review_text: body } : {}) });
    },
    onSuccess: () => {
      successHaptic();
      showToast(editing ? 'Review updated' : 'Review posted');
      setSheet(null);
      setEditing(null);
      setText('');
      setRating(0);
      refresh();
    },
    onError: (err) => {
      errorHaptic();
      setError(err instanceof ApiError ? (err.status === 409 ? 'You have already reviewed this game.' : err.message) : 'Could not post your review. Please try again.');
    },
  });

  const remove = useMutation({
    mutationFn: (r: Review) => deleteReview(r.id),
    onSuccess: () => {
      showToast('Review deleted');
      setDeleting(null);
      refresh();
    },
    onError: () => showToast('Could not delete your review. Please try again.'),
  });

  const report = useMutation({
    mutationFn: (r: Review) => reportReview(r.id, reason),
    onSuccess: () => {
      showToast('Thanks. We will look at it.');
      setReporting(null);
    },
    onError: () => showToast('Could not send your report. Please try again.'),
  });

  // coming from My reviews with "Edit": open that review's edit sheet once the list is here
  const editedOnce = useRef(false);
  useEffect(() => {
    if (!editId || editedOnce.current) return;
    const r = items.find((x) => x.id === editId);
    if (r) {
      editedOnce.current = true;
      openEdit(r);
    }
  }, [editId, items]);

  const openWrite = () => {
    tapHaptic();
    setEditing(null);
    setRating(0);
    setText('');
    setError(null);
    setSheet('write');
  };
  const openEdit = (r: Review) => {
    setMenu(null);
    setEditing(r);
    setRating(r.rating);
    setText(r.review_text ?? '');
    setError(null);
    setSheet('edit');
  };
  const closeSheet = () => {
    if (post.isPending) return;
    setSheet(null);
    setEditing(null);
  };
  const submit = () => {
    if (post.isPending) return;
    if (rating < 1) return setError('Tap the stars to rate your game.');
    setError(null);
    post.mutate();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.allSettled([reviews.refetch(), summary.refetch(), past.refetch()]);
    setRefreshing(false);
  }, [reviews, summary, past]);

  const average = summary.data?.average_rating ?? null;
  const count = summary.data?.review_count ?? items.length;
  const breakdown = summary.data?.breakdown ?? [0, 0, 0, 0, 0];
  const loading = reviews.isLoading || summary.isLoading;
  const failed = (reviews.isError && !reviews.data) || (summary.isError && !summary.data);
  const canWrite = !!writeFor && !loading && !failed;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title={arena.data?.name ?? 'Reviews'} />
      {loading ? (
        <View style={styles.list}>
          <View style={[styles.summary, { gap: 20 }]}>
            <Skeleton width={90} height={70} radius={10} />
            <View style={{ flex: 1, gap: 10 }}>
              <Skeleton height={8} radius={4} />
              <Skeleton height={8} radius={4} width="70%" />
            </View>
          </View>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, { gap: 10 }]}>
              <Skeleton height={14} width="40%" radius={7} />
              <Skeleton height={14} width="80%" radius={7} />
            </View>
          ))}
        </View>
      ) : failed ? (
        <ErrorState title="Could not load reviews." onRetry={onRefresh} />
      ) : (
        <KeyboardArea scrollRef={listRef}>
          {(sp) => (
            <FlatList
              ref={listRef}
              {...sp}
              data={items}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
              ListHeaderComponent={items.length > 0 ? <Summary average={average} count={count} breakdown={breakdown} /> : null}
              renderItem={({ item }) => (
                <ReviewCard
                  review={item}
                  mine={item.player_id === me?.id}
                  onMenu={(r, mine) => {
                    tapHaptic();
                    if (mine) setMenu({ review: r, mine });
                    else {
                      setReason(REASONS[0]);
                      setReporting(r);
                    }
                  }}
                />
              )}
              ListEmptyComponent={
                <EmptyState
                  icon={<Icon name="star" size={30} color={Colors.light.limeDeep} />}
                  title="No reviews yet."
                  text="Be the first to tell other players how it was."
                  buttonTitle={canWrite ? 'Write a review' : undefined}
                  onButton={canWrite ? openWrite : undefined}
                />
              }
            />
          )}
        </KeyboardArea>
      )}

      {canWrite && items.length > 0 ? (
        <StickyBar>
          <Button title="Write a review" variant="lime" onPress={openWrite} />
        </StickyBar>
      ) : null}

      <BottomSheet visible={sheet !== null} onClose={closeSheet} label={sheet === 'edit' ? 'Edit your review' : 'Write a review'}>
        <Text variant="archivo" style={styles.sheetTitle} accessibilityRole="header">
          {sheet === 'edit' ? 'Edit your review' : 'How was your game?'}
        </Text>
        <Text style={styles.sheetSub}>{sheet === 'edit' ? (arena.data?.name ?? '') : writeFor?.label}</Text>
        <View style={styles.starsRow} accessibilityRole="radiogroup">
          {[1, 2, 3, 4, 5].map((i) => (
            <Pressable
              key={i}
              onPress={() => {
                tapHaptic();
                setRating(i);
                setError(null);
              }}
              accessibilityRole="radio"
              accessibilityLabel={`${i} ${i === 1 ? 'star' : 'stars'}`}
              accessibilityState={{ selected: rating === i }}
              style={styles.starBtn}>
              <RatingStar filled={i <= rating} size={36} />
            </Pressable>
          ))}
        </View>
        <TextField
          kind="multiline"
          placeholder="Tell others about the court, lights and staff (optional)"
          value={text}
          onChangeText={(t) => setText(t.slice(0, MAX))}
          maxLength={MAX}
          accessibilityLabel="Review text"
          error={error}
        />
        <Text style={styles.counter}>
          {text.length} / {MAX}
        </Text>
        <Button title={sheet === 'edit' ? 'Save review' : 'Post review'} offlineLabel="Post review needs a connection" loading={post.isPending} disabled={rating < 1} onPress={submit} />
      </BottomSheet>

      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} label="Your review">
        <View style={{ marginTop: 2 }}>
          <Pressable onPress={() => menu && openEdit(menu.review)} accessibilityRole="button" accessibilityLabel="Edit review" style={[styles.menuRow, styles.menuLine]}>
            <View style={[styles.tile, { backgroundColor: Colors.light.lineSoft }]}>
              <IconExtra name="edit" color={Colors.light.text2} />
            </View>
            <Text style={styles.menuText}>Edit review</Text>
            <Icon name="chev" size={15} color={Colors.light.muted} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (menu) setDeleting(menu.review);
              setMenu(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete review"
            style={styles.menuRow}>
            <View style={[styles.tile, { backgroundColor: Colors.light.redWash }]}>
              <IconExtra name="trash" color={Colors.light.destructive} />
            </View>
            <Text style={styles.menuText}>Delete review</Text>
            <Icon name="chev" size={15} color={Colors.light.muted} />
          </Pressable>
        </View>
      </BottomSheet>

      <ConfirmSheet
        visible={!!deleting}
        title="Delete your review?"
        message="Other players will no longer see it."
        confirmLabel="Yes, delete review"
        loading={remove.isPending}
        stacked
        onConfirm={() => deleting && !remove.isPending && remove.mutate(deleting)}
        onCancel={() => !remove.isPending && setDeleting(null)}
      />

      <BottomSheet visible={!!reporting} onClose={() => !report.isPending && setReporting(null)} label="Report this review">
        <Text variant="archivo" style={styles.sheetTitle} accessibilityRole="header">
          Report this review
        </Text>
        <Text style={styles.sheetSub}>Why are you reporting it?</Text>
        <View accessibilityRole="radiogroup" style={{ marginBottom: 10 }}>
          {REASONS.map((r, i) => {
            const on = r === reason;
            return (
              <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.reasonRow, i < REASONS.length - 1 && styles.menuLine]}>
                <Text style={styles.reasonText}>{r}</Text>
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
        <Button title="Send report" offlineLabel="Send needs a connection" loading={report.isPending} onPress={() => reporting && !report.isPending && report.mutate(reporting)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  list: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 20, flexGrow: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 14, marginBottom: 12 },
  avg: { fontSize: 32, fontWeight: '700', color: Colors.light.text },
  count: { fontSize: 14, color: Colors.light.muted },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 12, fontSize: 14, color: Colors.light.text },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: Colors.light.lineSoft, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: Colors.light.amber },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  you: { fontWeight: '500', color: Colors.light.muted },
  when: { fontSize: 14, color: Colors.light.muted },
  dots: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotsText: { fontSize: 14, fontWeight: '700', color: Colors.light.muted, letterSpacing: 1 },
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.text, marginTop: 6 },
  reply: { marginTop: 10, padding: 10, borderRadius: 11, backgroundColor: Colors.light.lineSoft },
  replyTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  replyText: { fontSize: 14, lineHeight: 20, color: Colors.light.text, marginTop: 2 },
  sheetTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.38, color: Colors.light.text },
  sheetSub: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 12 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginBottom: 12 },
  starBtn: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  counter: { fontSize: 14, color: Colors.light.muted, textAlign: 'right', marginTop: 6, marginBottom: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  menuLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  menuText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  reasonText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: Colors.light.limeDeep },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.light.limeDeep },
});
