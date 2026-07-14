import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/booking-card';
import { Colors } from '@/constants/theme';
import { cancelBooking, listMyBookings } from '@/services/bookings';
import type { Booking } from '@/types';

const UPCOMING_STATUSES: Booking['status'][] = ['pending_payment', 'pending_approval', 'confirmed'];

export default function BookingsScreen() {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings'],
    queryFn: () => listMyBookings(),
  });

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => cancelBooking(bookingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
    onError: () => Alert.alert('Could not cancel', 'Please try again.'),
  });

  const items = (data?.items ?? []).filter((b) =>
    tab === 'upcoming' ? UPCOMING_STATUSES.includes(b.status) : !UPCOMING_STATUSES.includes(b.status),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.title}>My Bookings</Text>

      <View style={styles.tabs}>
        {(['upcoming', 'past'] as const).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'upcoming' ? 'Upcoming' : 'Past'}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              cancelling={cancelMutation.isPending && cancelMutation.variables === item.id}
              onCancel={(booking) =>
                Alert.alert('Cancel booking?', 'This may be subject to the arena’s refund policy.', [
                  { text: 'Keep booking', style: 'cancel' },
                  {
                    text: 'Cancel booking',
                    style: 'destructive',
                    onPress: () => cancelMutation.mutate(booking.id),
                  },
                ])
              }
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'upcoming' ? 'No upcoming bookings yet.' : 'No past bookings yet.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: Colors.light.text, paddingHorizontal: 20, paddingTop: 12 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.light.card },
  tabActive: { backgroundColor: Colors.light.tint },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  tabTextActive: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 32 },
});
