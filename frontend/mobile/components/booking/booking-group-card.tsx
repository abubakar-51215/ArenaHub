import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { StatusPill } from '@/components/booking/parts';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { dateParts, refundLine, statusPill } from '@/lib/bookings-ui';
import { timeRange } from '@/lib/checkout';
import type { BookingGroupItem } from '@/types';

/** One card of My bookings (frames "Upcoming", "Past", "Cancelled"): date block, arena, time and court, status, and the line at the right. */
export function BookingGroupCard({ item }: { item: BookingGroupItem }) {
  const p = dateParts(item.booking_date);
  const pill = statusPill(item.status);
  const dim = item.tab !== 'upcoming';
  const open = () => router.push({ pathname: '/booking/detail/[groupId]', params: { groupId: item.booking_group_id } });
  const rate = () => router.push({ pathname: '/arena/[id]/reviews', params: { id: item.arena_id, bookingId: item.booking_id } });

  let right: React.ReactNode = <Text style={styles.mute}>{item.booking_code}</Text>;
  if (item.tab === 'past' && item.status === 'completed') {
    right = item.my_rating != null ? <Text style={styles.mute}>{`Rated ${item.my_rating} ${item.my_rating === 1 ? 'star' : 'stars'}`}</Text> : null;
  } else if (item.tab === 'cancelled') {
    right = <Text style={[styles.mute, { textAlign: 'right', flexShrink: 1 }]}>{refundLine(item.refund_amount, item.refund_status)}</Text>;
  } else if (item.status === 'pending_approval' || item.status === 'pending_payment') {
    right = null;
  }

  const label = `${item.arena_name}, ${p.weekday} ${p.day} ${p.month}, ${timeRange(item.start_time, item.end_time)}, ${pill.label}`;
  // the card is a plain box: the top and the status row open the booking, and "Rate this game" is its own
  // button beside them (a button inside a button is not allowed on the web)
  const rating = item.tab === 'past' && item.status === 'completed' && item.my_rating == null;
  return (
    <View style={styles.card}>
      <PressableScale contentStyle={styles.pad} onPress={open} accessibilityRole="button" accessibilityLabel={label}>
        <View style={styles.top}>
          <View style={[styles.date, dim && { backgroundColor: Colors.light.lineSoft }]}>
            <Text variant="archivo" style={[styles.day, !dim && { color: Colors.light.lime }, dim && { color: Colors.light.text2 }]}>
              {p.day}
            </Text>
            <Text style={[styles.month, { color: dim ? Colors.light.text2 : Colors.light.paper }]}>{p.month}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.arena_name}
            </Text>
            <Text style={styles.mute} numberOfLines={1}>
              {`${p.weekday} · ${timeRange(item.start_time, item.end_time)} · ${item.court_name}`}
            </Text>
          </View>
          <Icon name="chev" size={18} color={Colors.light.muted} />
        </View>
        <View style={styles.bottom}>
          <StatusPill label={pill.label} tone={pill.tone} />
          {rating ? null : right}
        </View>
      </PressableScale>
      {rating ? (
        <PressableScale onPress={rate} accessibilityRole="button" accessibilityLabel="Rate this game" style={styles.rateBox} contentStyle={styles.rate}>
          <Text style={styles.rateText}>Rate this game</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, marginBottom: 10 },
  pad: { padding: 12 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  date: { width: 50, height: 54, borderRadius: 12, backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 18, lineHeight: 19, fontWeight: '700' },
  month: { fontSize: 14, fontWeight: '600', lineHeight: 15 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  mute: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.light.line, borderStyle: 'dashed' },
  rateBox: { position: 'absolute', right: 12, bottom: 4 },
  rate: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  rateText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeDeep },
});
