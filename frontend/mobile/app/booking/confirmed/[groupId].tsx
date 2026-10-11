import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Line } from '@/components/booking/parts';
import { BrandMark } from '@/components/brand/brand-mark';
import { ResultScreen } from '@/components/booking/result';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CourtArt } from '@/components/ui/court-art';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useArenaCourts } from '@/hooks/useArenas';
import { buildIcs, clockLabel, dayAndMonth, hoursLabel, timeRange } from '@/lib/checkout';
import { successHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { getBookingGroup } from '@/services/bookings';
import { useCheckout } from '@/store/checkout';

import { useBackTo } from '@/hooks/useBackTo';
// Booking confirmed, from arena-hub-player-app-booking-payment.html (frame 10): the ArenaHub
// mark lights its ring and lands the ball once (with the success buzz), the booking code, the time,
// what was paid and the arena's cancellation rules as text. "Add to calendar" shares a
// calendar file (.ics) with a reminder one hour before.
const METHOD_LABEL: Record<string, string> = { bank_transfer: 'Bank transfer', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };

export default function BookingConfirmedScreen() {
  useBackTo('/(tabs)/bookings');
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId) });
  const g = group.data;
  const courts = useArenaCourts(g?.arena_id);
  const sport = courts.data?.find((c) => c.id === g?.court_id)?.sport_types[0];
  const forget = useCheckout((s) => s.forget);
  const buzzed = useRef(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    forget();
  }, [forget]);
  useEffect(() => {
    if (g && !buzzed.current) {
      buzzed.current = true;
      successHaptic();
    }
  }, [g]);

  async function addToCalendar() {
    if (!g || sharing) return;
    setSharing(true);
    try {
      const ics = buildIcs({
        code: g.booking_code,
        title: `${g.arena_name} · ${g.court_name}`,
        place: [g.arena_name, g.arena_address].filter(Boolean).join(', '),
        date: g.booking_date,
        start: g.start_time,
        end: g.end_time,
      });
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${g.booking_code}.ics`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, `${g.booking_code}.ics`);
        if (file.exists) file.delete();
        file.create();
        file.write(ics);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'public.calendar-event' });
        else showToast('Sharing is not available on this device.');
      }
    } catch {
      showToast('Could not make the calendar file. Please try again.');
    } finally {
      setSharing(false);
    }
  }

  const paid = g ? (g.payment_status === 'completed' ? g.pay_now : null) : null;
  return (
    <ResultScreen
      top={36}
      mark={<BrandMark mode="success" tone="light" size={104} />}
      title="You are on the pitch."
      text={g ? `${dayAndMonth(g.booking_date)} · ${clockLabel(g.start_time)}. We will remind you one hour before.` : ' '}
      buttons={
        <>
          <Button title="Add to calendar" loading={sharing} disabled={!g} onPress={addToCalendar} />
          <Button title="View my bookings" variant="ghost" onPress={() => router.replace('/(tabs)/bookings')} />
        </>
      }>
      {g ? (
        <Card>
          <View style={styles.art}>
            <CourtArt sport={sport} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.arena}>{g.arena_name}</Text>
            <Text style={styles.sub}>{[g.arena_address, g.court_name].filter(Boolean).join(' · ')}</Text>
            <View style={{ height: 10 }} />
            <Line label="Booking ID" value={g.booking_code} />
            <Line label="Time" value={`${timeRange(g.start_time, g.end_time)} · ${hoursLabel(g.slot_count)}`} />
            {paid != null ? <Line label="Paid" value={`${formatRs(paid)}${g.payment_method ? ` · ${METHOD_LABEL[g.payment_method] ?? ''}` : ''}`} /> : null}
            {Number(g.due_at_arena) > 0 ? <Line label="Pay at the arena" value={formatRs(g.due_at_arena)} /> : null}
            <View style={styles.rules}>
              <Text style={styles.rulesText}>{g.cancellation_note}</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Skeleton height={240} radius={15} />
      )}
    </ResultScreen>
  );
}

const styles = StyleSheet.create({
  art: { height: 78 },
  cardBody: { padding: 12 },
  arena: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  sub: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  rules: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.light.line, borderStyle: 'dashed' },
  rulesText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted },
});
