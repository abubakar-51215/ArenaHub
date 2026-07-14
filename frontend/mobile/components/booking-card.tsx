import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useArena } from '@/hooks/useArenas';
import type { Booking } from '@/types';

const STATUS_COLORS: Record<Booking['status'], string> = {
  pending_payment: Colors.light.warning,
  pending_approval: Colors.light.warning,
  confirmed: Colors.light.success,
  completed: Colors.light.tint,
  cancelled: Colors.light.destructive,
  rejected: Colors.light.destructive,
};

const CANCELLABLE: Booking['status'][] = ['pending_payment', 'pending_approval', 'confirmed'];

export function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  cancelling: boolean;
}) {
  const arena = useArena(booking.arena_id);

  return (
    <View style={styles.card}>
      <Image
        source={arena.data?.images[0] ? { uri: arena.data.images[0] } : undefined}
        style={styles.image}
        contentFit="cover"
      />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.arenaName} numberOfLines={1}>
            {arena.data?.name ?? 'Loading…'}
          </Text>
          <View style={[styles.badge, { backgroundColor: `${STATUS_COLORS[booking.status]}22` }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLORS[booking.status] }]}>
              {booking.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {booking.booking_date} · {booking.start_time.slice(0, 5)}–{booking.end_time.slice(0, 5)}
        </Text>
        <Text style={styles.amount}>Rs. {booking.total_amount}</Text>
        {CANCELLABLE.includes(booking.status) ? (
          <Button
            title="Cancel"
            variant="outline"
            loading={cancelling}
            onPress={() => onCancel(booking)}
          />
        ) : null}
        {booking.status === 'completed' ? (
          <Button
            title="Write a Review"
            variant="outline"
            onPress={() =>
              router.push({
                pathname: '/arena/[id]/reviews',
                params: { id: booking.arena_id, bookingId: booking.id },
              })
            }
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  image: { width: 90, backgroundColor: Colors.light.card },
  body: { flex: 1, padding: 12, gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arenaName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: Colors.light.muted },
  amount: { fontSize: 13, fontWeight: '700', color: Colors.light.text, marginBottom: 4 },
});
