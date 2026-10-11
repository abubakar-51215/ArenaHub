import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';
import { IconExtra } from '@/components/ui/icon-extra';
import { RatingStar } from '@/components/ui/rating-star';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { timeAgo } from '@/lib/karachi';
import { deleteReview, listMyReviews } from '@/services/reviews';
import type { MyReview } from '@/types';

// My reviews, from arena-hub-player-app-account.html (frame 16): every review I wrote with the arena it is about, its stars, the
// date, my words and the arena's reply. Tapping a card opens that arena's reviews; the three dots open Edit / Delete.
function ReviewRow({ review, onOpen, onMenu }: { review: MyReview; onOpen: (r: MyReview) => void; onMenu: (r: MyReview) => void }) {
  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(review)} accessibilityRole="button" accessibilityLabel={`${review.arena_name}, ${review.rating} stars`} style={styles.main}>
        <View style={styles.top}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{review.arena_name.trim()[0]?.toUpperCase() ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={2}>
              {review.arena_name}
            </Text>
            <Text style={styles.when}>{timeAgo(review.created_at)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }} accessibilityLabel={`${review.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <RatingStar key={i} filled={i <= review.rating} size={14} />
          ))}
        </View>
        {review.review_text ? <Text style={styles.text}>{review.review_text}</Text> : null}
        {review.owner_response ? (
          <View style={styles.reply}>
            <Text style={styles.replyTitle}>Reply from the arena</Text>
            <Text style={styles.replyText}>{review.owner_response}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable onPress={() => onMenu(review)} accessibilityRole="button" accessibilityLabel={`Edit or delete your review of ${review.arena_name}`} style={styles.dots}>
        <Text style={styles.dotsText}>•••</Text>
      </Pressable>
    </View>
  );
}

export default function MyReviewsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['my-reviews'], queryFn: listMyReviews, retry: 1 });
  const [menu, setMenu] = useState<MyReview | null>(null);
  const [deleting, setDeleting] = useState<MyReview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const remove = useMutation({
    mutationFn: (r: MyReview) => deleteReview(r.id),
    onSuccess: (_d, r) => {
      showToast('Review deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['my-reviews'] });
      qc.invalidateQueries({ queryKey: ['arena-reviews', r.arena_id] });
      qc.invalidateQueries({ queryKey: ['arena-rating', r.arena_id] });
      qc.invalidateQueries({ queryKey: ['booking-groups'] });
    },
    onError: () => showToast('Could not delete your review. Please try again.'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  const open = (r: MyReview) => router.push({ pathname: '/arena/[id]/reviews', params: { id: r.arena_id } } as unknown as Href);

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="My reviews" />
      {q.isLoading ? (
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.card, { padding: 14, gap: 10 }]}>
              <Skeleton height={14} width="45%" radius={7} />
              <Skeleton height={14} width="80%" radius={7} />
            </View>
          ))}
        </View>
      ) : q.isError && !q.data ? (
        <ErrorState title="Could not load your reviews." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data?.items ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ReviewRow
              review={item}
              onOpen={open}
              onMenu={(r) => {
                tapHaptic();
                setMenu(r);
              }}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="star" size={30} color={Colors.light.limeDeep} />}
              title="No reviews yet."
              text="After a game, rate it from My bookings. Your reviews will show up here."
              buttonTitle="Go to My bookings"
              onButton={() => router.push('/(tabs)/bookings' as unknown as Href)}
            />
          }
        />
      )}

      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} label="Your review">
        <Pressable
          onPress={() => {
            if (menu) router.push({ pathname: '/arena/[id]/reviews', params: { id: menu.arena_id, editId: menu.id } } as unknown as Href);
            setMenu(null);
          }}
          accessibilityRole="button"
          accessibilityLabel="Edit review"
          style={[styles.menuRow, styles.menuLine]}>
          <View style={[styles.tile, { backgroundColor: Colors.light.lineSoft }]}>
            <IconExtra name="edit" color={Colors.light.text2} />
          </View>
          <Text style={styles.menuText}>Edit review</Text>
          <Icon name="chev" size={15} color={Colors.light.muted} />
        </Pressable>
        <Pressable
          onPress={() => {
            if (menu) setDeleting(menu);
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, flexGrow: 1 },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, marginBottom: 10, overflow: 'hidden' },
  main: { padding: 12, paddingRight: 52, minHeight: 60 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.light.lineSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  when: { fontSize: 14, color: Colors.light.muted },
  text: { fontSize: 14, lineHeight: 21, color: Colors.light.text, marginTop: 6 },
  reply: { marginTop: 10, padding: 10, borderRadius: 11, backgroundColor: Colors.light.lineSoft },
  replyTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  replyText: { fontSize: 14, lineHeight: 20, color: Colors.light.text, marginTop: 2 },
  dots: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotsText: { fontSize: 14, fontWeight: '700', color: Colors.light.muted, letterSpacing: 1 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  menuLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  menuText: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
