import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { useArena } from '@/hooks/useArenas';
import { ApiError } from '@/lib/api';
import { listArenaReviews, submitReview } from '@/services/reviews';
import { getRatingSummary } from '@/services/arenas';
import type { Review } from '@/types';

export default function ArenaReviewsScreen() {
  const { id: arenaId, bookingId } = useLocalSearchParams<{ id: string; bookingId?: string }>();
  const arena = useArena(arenaId);
  const queryClient = useQueryClient();

  const reviews = useQuery({
    queryKey: ['arena-reviews', arenaId],
    queryFn: () => listArenaReviews(arenaId),
    enabled: !!arenaId,
  });
  const summary = useQuery({
    queryKey: ['arena-rating', arenaId],
    queryFn: () => getRatingSummary(arenaId),
    enabled: !!arenaId,
  });

  const breakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const r of reviews.data?.items ?? []) counts[5 - r.rating]++;
    return counts;
  }, [reviews.data]);
  const totalReviews = reviews.data?.total ?? 0;

  const [composerOpen, setComposerOpen] = useState(!!bookingId);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () => submitReview(arenaId, { booking_id: bookingId as string, rating, review_text: text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['arena-reviews', arenaId] });
      queryClient.invalidateQueries({ queryKey: ['arena-rating', arenaId] });
      setComposerOpen(false);
      setText('');
    },
    onError: (err) =>
      setError(
        err instanceof ApiError
          ? err.status === 409
            ? "You've already reviewed this booking."
            : err.message
          : 'Something went wrong.',
      ),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Reviews & Ratings</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={reviews.data?.items ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.arenaName}>{arena.data?.name}</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.avgRating}>{summary.data?.average_rating?.toFixed(1) ?? '—'}</Text>
              <View>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons key={i} name="star" size={14} color="#F59E0B" />
                  ))}
                </View>
                <Text style={styles.reviewCount}>{totalReviews} reviews</Text>
              </View>
            </View>

            <View style={styles.breakdown}>
              {breakdown.map((count, i) => {
                const stars = 5 - i;
                const pct = totalReviews ? (count / totalReviews) * 100 : 0;
                return (
                  <View key={stars} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{stars}★</Text>
                    <View style={styles.breakdownBarTrack}>
                      <View style={[styles.breakdownBarFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.breakdownCount}>{count}</Text>
                  </View>
                );
              })}
            </View>

            {bookingId ? (
              composerOpen ? (
                <View style={styles.composer}>
                  <Text style={styles.composerTitle}>Write a Review</Text>
                  <View style={styles.starsPicker}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Pressable key={i} onPress={() => setRating(i)}>
                        <Ionicons
                          name={i <= rating ? 'star' : 'star-outline'}
                          size={28}
                          color="#F59E0B"
                        />
                      </Pressable>
                    ))}
                  </View>
                  <TextField
                    placeholder="Share your experience…"
                    value={text}
                    onChangeText={setText}
                    multiline
                    numberOfLines={3}
                    style={{ height: 80, textAlignVertical: 'top' }}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  <Button
                    title="Submit Review"
                    loading={submitMutation.isPending}
                    onPress={() => {
                      setError(null);
                      submitMutation.mutate();
                    }}
                  />
                </View>
              ) : null
            ) : null}

            <Text style={styles.sectionTitle}>All Reviews</Text>
          </View>
        }
        renderItem={({ item }) => <ReviewRow review={item} />}
        ListEmptyComponent={
          reviews.isLoading ? (
            <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 16 }} />
          ) : (
            <Text style={styles.empty}>No reviews yet.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

function ReviewRow({ review }: { review: Review }) {
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewerName}>{review.reviewer_name}</Text>
        <Text style={styles.reviewDate}>{new Date(review.created_at).toLocaleDateString()}</Text>
      </View>
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Ionicons
            key={i}
            name={i <= review.rating ? 'star' : 'star-outline'}
            size={12}
            color="#F59E0B"
          />
        ))}
      </View>
      {review.review_text ? <Text style={styles.reviewText}>{review.review_text}</Text> : null}
      {review.owner_response ? (
        <View style={styles.ownerResponse}>
          <Text style={styles.ownerResponseLabel}>Owner response</Text>
          <Text style={styles.ownerResponseText}>{review.owner_response}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  arenaName: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  avgRating: { fontSize: 32, fontWeight: '800', color: Colors.light.text },
  starsRow: { flexDirection: 'row', gap: 2 },
  reviewCount: { fontSize: 12, color: Colors.light.muted, marginTop: 2 },
  breakdown: { marginTop: 16, gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: { fontSize: 11, color: Colors.light.muted, width: 24 },
  breakdownBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.light.card },
  breakdownBarFill: { height: 6, borderRadius: 3, backgroundColor: '#F59E0B' },
  breakdownCount: { fontSize: 11, color: Colors.light.muted, width: 20, textAlign: 'right' },
  composer: { marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.border, gap: 10 },
  composerTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  starsPicker: { flexDirection: 'row', gap: 6 },
  errorText: { color: Colors.light.destructive, fontSize: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginTop: 20, marginBottom: 8 },
  reviewRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border, gap: 4 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewerName: { fontSize: 13, fontWeight: '700', color: Colors.light.text },
  reviewDate: { fontSize: 11, color: Colors.light.muted },
  reviewText: { fontSize: 13, color: Colors.light.text, marginTop: 2, lineHeight: 18 },
  ownerResponse: { marginTop: 6, padding: 10, backgroundColor: Colors.light.card, borderRadius: 8 },
  ownerResponseLabel: { fontSize: 11, fontWeight: '700', color: Colors.light.tint },
  ownerResponseText: { fontSize: 12, color: Colors.light.text, marginTop: 2 },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 16 },
});
