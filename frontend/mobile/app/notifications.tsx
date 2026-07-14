import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { listMyBookings } from '@/services/bookings';
import type { Booking } from '@/types';

/**
 * No notifications backend exists yet (FCM + a notification table land in
 * Sprint 5, per MASTER_DEVELOPMENT_PLAN.md's exit criteria). This derives a
 * feed client-side from the player's own bookings — booking-confirmed,
 * payment-successful, awaiting-approval, and an upcoming-reminder for
 * bookings starting soon — so the screen is real, not mocked, without
 * pulling Sprint 5 backend work forward.
 */
interface NotificationItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  sortKey: string;
}

function buildNotifications(bookings: Booking[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  const now = new Date();

  for (const b of bookings) {
    const start = new Date(`${b.booking_date}T${b.start_time}`);
    const hoursUntil = (start.getTime() - now.getTime()) / 36e5;

    if (b.status === 'confirmed') {
      items.push({
        id: `${b.id}-confirmed`,
        icon: 'checkmark-circle',
        color: Colors.light.success,
        title: 'Booking Confirmed',
        subtitle: `${b.booking_date}, ${b.start_time.slice(0, 5)}`,
        sortKey: b.booking_date,
      });
      if (hoursUntil > 0 && hoursUntil <= 24) {
        items.push({
          id: `${b.id}-reminder`,
          icon: 'alarm-outline',
          color: Colors.light.warning,
          title: 'Upcoming Booking',
          subtitle: `Starts in ${Math.max(1, Math.round(hoursUntil))}h — ${b.start_time.slice(0, 5)}`,
          sortKey: `${b.booking_date}z`,
        });
      }
    }
    if (b.status === 'pending_approval') {
      items.push({
        id: `${b.id}-pending`,
        icon: 'time-outline',
        color: Colors.light.warning,
        title: 'Awaiting Owner Approval',
        subtitle: `Receipt submitted for ${b.booking_date}`,
        sortKey: b.booking_date,
      });
    }
    if (b.payment_status === 'completed') {
      items.push({
        id: `${b.id}-paid`,
        icon: 'card-outline',
        color: Colors.light.tint,
        title: 'Payment Successful',
        subtitle: `Paid Rs. ${b.total_amount} for your booking`,
        sortKey: b.booking_date,
      });
    }
    if (b.status === 'cancelled') {
      items.push({
        id: `${b.id}-cancelled`,
        icon: 'close-circle-outline',
        color: Colors.light.destructive,
        title: 'Booking Cancelled',
        subtitle: b.cancellation_reason ?? `${b.booking_date} booking was cancelled`,
        sortKey: b.booking_date,
      });
    }
    if (b.status === 'rejected') {
      items.push({
        id: `${b.id}-rejected`,
        icon: 'alert-circle-outline',
        color: Colors.light.destructive,
        title: 'Booking Rejected',
        subtitle: b.cancellation_reason ?? 'Your receipt was not approved',
        sortKey: b.booking_date,
      });
    }
  }

  return items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));
}

export default function NotificationsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-bookings-for-notifications'],
    queryFn: () => listMyBookings(),
  });

  const notifications = useMemo(() => buildNotifications(data?.items ?? []), [data]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: `${item.color}22` }]}>
                <Ionicons name={item.icon} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
        />
      )}
    </SafeAreaView>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.light.border },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  rowSubtitle: { fontSize: 12, color: Colors.light.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 32 },
});
