import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { CalendarMark } from '@/components/booking/parts';
import { Circle, ResultScreen } from '@/components/booking/result';
import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useArenaCourts } from '@/hooks/useArenas';
import { dayAndMonth, timeRange } from '@/lib/checkout';
import { errorHaptic } from '@/lib/haptics';
import { useCheckout } from '@/store/checkout';

// Slot lost, from arena-hub-player-app-booking-payment.html (frame 9): someone else
// took the time between Pick a slot and Pay. Nothing was charged and nothing was booked.
export default function SlotLostScreen() {
  const { courtId, arenaId, date, start, end } = useLocalSearchParams<{ courtId: string; arenaId: string; date: string; start: string; end: string }>();
  const courts = useArenaCourts(arenaId);
  const court = courts.data?.find((c) => c.id === courtId);
  const forget = useCheckout((s) => s.forget);
  useEffect(() => {
    forget();
    errorHaptic();
  }, [forget]);

  const when = date && start && end ? `${dayAndMonth(date).replace(', ', ' ')}, ${timeRange(start, end)}` : 'That time';
  return (
    <ResultScreen
      top={60}
      mark={
        <Circle bg={Colors.light.lineSoft}>
          <CalendarMark />
        </Circle>
      }
      title="That time was just taken."
      text={`Someone booked ${when}${court ? ` at ${court.name}` : ''} while you were checking out. You have not been charged.`}
      buttons={
        <>
          <Button title="Choose another time" onPress={() => router.replace({ pathname: '/court/[id]/slots', params: { id: courtId, arenaId } })} />
          <Button title="Back to arena" variant="ghost" onPress={() => router.dismissTo({ pathname: '/arena/[id]', params: { id: arenaId } })} />
        </>
      }
    />
  );
}
