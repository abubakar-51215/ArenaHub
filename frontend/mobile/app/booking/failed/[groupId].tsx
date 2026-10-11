import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { Circle, ResultScreen } from '@/components/booking/result';
import { CrossIcon } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { errorHaptic } from '@/lib/haptics';
import { getBookingGroup } from '@/services/bookings';
import { useCheckout } from '@/store/checkout';

import { useBackTo } from '@/hooks/useBackTo';
// Payment failed, from arena-hub-player-app-booking-payment.html (frame 7). While the
// booking still holds the time, "Try again" and "Choose another way" go back to Payment.
// If the time was already let go (the arena turned the receipt down, or it ran out),
// the buttons offer another time or the arena instead.
export default function PaymentFailedScreen() {
  useBackTo('/(tabs)');
  const { groupId, arenaId, courtId } = useLocalSearchParams<{ groupId: string; arenaId?: string; courtId?: string }>();
  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId), retry: 1 });
  const g = group.data;
  const forget = useCheckout((s) => s.forget);
  useEffect(() => errorHaptic(), []);

  const held = !g || g.status === 'pending_payment';
  const arena = g?.arena_id ?? arenaId;
  const court = g?.court_id ?? courtId;
  useEffect(() => {
    if (g && !held) forget();
  }, [g, held, forget]);

  return (
    <ResultScreen
      mark={
        <Circle bg={Colors.light.redWash}>
          <CrossIcon />
        </Circle>
      }
      title="Payment did not go through."
      text={
        held
          ? 'You have not been charged. Your time is still held. Try again or use another way to pay.'
          : 'You have not been charged. Your time was let go, so someone else can book it. Choose a time to try again.'
      }
      buttons={
        held ? (
          <>
            <Button title="Try again" onPress={() => router.back()} />
            <Button title="Choose another way" variant="ghost" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Button
              title="Choose another time"
              onPress={() => (court && arena ? router.replace({ pathname: '/court/[id]/slots', params: { id: court, arenaId: arena } }) : router.replace('/(tabs)'))}
            />
            <Button
              title="Back to arena"
              variant="ghost"
              onPress={() => (arena ? router.dismissTo({ pathname: '/arena/[id]', params: { id: arena } }) : router.replace('/(tabs)'))}
            />
          </>
        )
      }
    />
  );
}
