import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Circle, ResultScreen } from '@/components/booking/result';
import { ClockIcon, Line, StatusPill } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Colors } from '@/constants/theme';
import { shortDate, timeRange } from '@/lib/checkout';
import { formatRs } from '@/lib/money';
import { getBookingGroup } from '@/services/bookings';
import { useCheckout } from '@/store/checkout';

// Awaiting approval, from arena-hub-player-app-booking-payment.html (frame 6): the
// receipt is with the arena. The screen checks every 15 seconds and moves on when
// the arena confirms (Booking confirmed) or turns the receipt down (Payment failed).
export default function AwaitingApprovalScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const forget = useCheckout((s) => s.forget);
  useEffect(() => forget(), [forget]);

  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId), refetchInterval: 15000 });
  const g = group.data;
  useEffect(() => {
    if (!g) return;
    if (g.status === 'confirmed') router.replace({ pathname: '/booking/confirmed/[groupId]', params: { groupId } });
    else if (g.status === 'rejected' || g.status === 'cancelled') router.replace({ pathname: '/booking/failed/[groupId]', params: { groupId, arenaId: g.arena_id, courtId: g.court_id } });
  }, [g, groupId]);

  return (
    <ResultScreen
      mark={
        <Circle bg={Colors.light.amberWash}>
          <ClockIcon />
        </Circle>
      }
      title="Receipt sent."
      text="The arena is checking your payment. We will tell you here and by email as soon as it is confirmed."
      buttons={
        <>
          <Button title="View my bookings" onPress={() => router.replace('/(tabs)/bookings')} />
          <Button title="Back to home" variant="ghost" onPress={() => router.replace('/(tabs)')} />
        </>
      }>
      {g ? (
        <Card style={{ padding: 12 }}>
          <Line label="Booking" value={g.booking_code} />
          <Line label="Time" value={`${shortDate(g.booking_date)} · ${timeRange(g.start_time, g.end_time)}`} />
          <Line label="Amount" value={formatRs(g.pay_now)} />
          <Line label="Status" value={<StatusPill tone="wait" label="Awaiting approval" />} />
        </Card>
      ) : (
        <View>
          <Skeleton height={140} radius={15} />
        </View>
      )}
    </ResultScreen>
  );
}
