import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Line } from '@/components/booking/parts';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorCopy } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { longDate, timeRange } from '@/lib/checkout';
import { getBookingPass } from '@/services/bookings';

// There is no owner scan/verify route yet: this pass is informational only, the
// same code the player would read out or show at the counter.
export default function BookingPassScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const pass = useQuery({
    queryKey: ['booking-pass', bookingId],
    queryFn: () => getBookingPass(bookingId),
    retry: 1,
  });
  const p = pass.data;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Your pass" />
      {pass.isError ? (
        <View style={styles.center}>
          <View style={{ marginBottom: 14 }}>
            <BrandMark mode="offline" size={74} />
          </View>
          <ErrorCopy title="Could not load your pass" titleStyle={styles.stateTitle} textStyle={styles.stateText} />
          <View style={{ width: 200 }}>
            <Button title="Try again" onPress={() => pass.refetch()} />
          </View>
        </View>
      ) : !p ? (
        <View style={styles.pad}>
          <Skeleton height={240} radius={15} />
          <View style={{ height: 11 }} />
          <Skeleton height={150} radius={15} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Card style={styles.qrCard}>
            {p.qr_code_url ? (
              <Image source={{ uri: p.qr_code_url }} style={styles.qr} resizeMode="contain" accessibilityLabel="Booking pass QR code" />
            ) : (
              <Text style={styles.mute}>No QR available for this booking.</Text>
            )}
            <Text variant="archivo" style={styles.code}>
              {p.booking_code}
            </Text>
          </Card>

          <Card style={styles.info}>
            <Line label="Arena" value={p.arena_name} />
            <Line label="Court" value={p.court_name} />
            <Line label="Date" value={longDate(p.booking_date)} />
            <Line label="Time" value={timeRange(p.start_time, p.end_time)} />
          </Card>

          <Text style={styles.footnote}>Show this pass at the arena.</Text>
          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2 },
  qrCard: { padding: 20, alignItems: 'center', gap: 14 },
  qr: { width: 220, height: 220 },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 1.4, color: Colors.light.text },
  mute: { fontSize: 14, color: Colors.light.muted },
  info: { padding: 12, marginTop: 11 },
  footnote: { fontSize: 13, lineHeight: 19, color: Colors.light.muted, marginTop: 14, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 18 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 16, textAlign: 'center' },
});
