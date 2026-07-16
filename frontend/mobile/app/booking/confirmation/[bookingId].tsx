import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Colors, Shadow } from '@/constants/theme';
import { getBooking } from '@/services/bookings';

export default function BookingConfirmationScreen() {
  const { bookingId, pendingApproval } = useLocalSearchParams<{
    bookingId: string;
    pendingApproval?: string;
  }>();
  const isPending = pendingApproval === '1';

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
    enabled: !!bookingId,
  });

  if (isLoading || !booking) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <View style={[styles.iconHalo, { backgroundColor: isPending ? '#FEF3C7' : '#DCFCE7' }]}>
          <LinearGradient
            colors={isPending ? ['#FBBF24', '#D97706'] : ['#22C55E', '#16A34A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Ionicons
              name={isPending ? 'time-outline' : 'checkmark'}
              size={44}
              color="#fff"
            />
          </LinearGradient>
        </View>
        <Text style={styles.title}>{isPending ? 'Awaiting Approval' : 'Booking Confirmed!'}</Text>
        <Text style={styles.subtitle}>
          {isPending
            ? 'The owner will review your receipt and confirm shortly.'
            : 'Your booking has been confirmed. Get ready to play!'}
        </Text>

        <View style={styles.card}>
          <Row label="Date" value={booking.booking_date} />
          <Row
            label="Time"
            value={`${booking.start_time.slice(0, 5)} – ${booking.end_time.slice(0, 5)}`}
          />
          <Row label="Booking ID" value={booking.id.slice(0, 8).toUpperCase()} />
          <Row label="Amount" value={`Rs. ${booking.total_amount}`} />
          <Row label="Status" value={booking.status.replace('_', ' ')} />
        </View>

        {booking.qr_code_url ? (
          <Image source={{ uri: booking.qr_code_url }} style={styles.qr} />
        ) : null}

        <View style={styles.actions}>
          <Button title="View My Bookings" onPress={() => router.replace('/(tabs)/bookings')} />
          <Button title="Back to Home" variant="outline" onPress={() => router.replace('/(tabs)')} />
        </View>
      </View>
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
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  iconHalo: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.brand,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  card: { width: '100%', backgroundColor: Colors.light.card, borderRadius: 14, padding: 16, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.light.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: Colors.light.muted },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.light.text, textTransform: 'capitalize' },
  qr: { width: 160, height: 160, marginTop: 20, borderRadius: 12, backgroundColor: Colors.light.card },
  actions: { width: '100%', gap: 12, marginTop: 28 },
});
