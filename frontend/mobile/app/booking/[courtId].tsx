import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, IconTile, Line, Note } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CourtArt } from '@/components/ui/court-art';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { sportLabel } from '@/constants/sports';
import { useArena, useArenaCourts, useArenaRating } from '@/hooks/useArenas';
import { ApiError } from '@/lib/api';
import { hoursLabel, longDate, parseSlots, timeRange } from '@/lib/checkout';
import { formatRs } from '@/lib/money';
import { previewBooking } from '@/services/bookings';
import { listArenaEquipment } from '@/services/equipment';

// Review booking, from arena-hub-player-app-booking-payment.html (frame 1).
// The price is worked out by the server (POST /bookings/preview) so what is
// shown here is what the booking will cost; nothing is reserved yet. If a time
// was taken since Pick a slot, the server says so (409) and the Slot lost
// screen opens.
export default function ReviewBookingScreen() {
  const { courtId, arenaId, slots: slotsParam } = useLocalSearchParams<{ courtId: string; arenaId: string; slots: string }>();
  const slots = useMemo(() => parseSlots(slotsParam), [slotsParam]);
  const arena = useArena(arenaId);
  const courts = useArenaCourts(arenaId);
  const rating = useArenaRating(arenaId);
  const court = courts.data?.find((c) => c.id === courtId);
  const equipment = useQuery({ queryKey: ['arena-equipment', arenaId], queryFn: () => listArenaEquipment(arenaId), enabled: !!arenaId });
  const extras = (equipment.data ?? []).filter((e) => e.is_active && e.quantity_available > 0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const equipmentList = Object.entries(picked)
    .filter(([, q]) => q > 0)
    .map(([equipment_id, quantity]) => ({ equipment_id, quantity }));

  const slotIds = slots.map((s) => s.id);
  const preview = useQuery({
    queryKey: ['booking-preview', courtId, slotIds.join(','), JSON.stringify(equipmentList)],
    queryFn: () => previewBooking({ court_id: courtId, slot_ids: slotIds, equipment: equipmentList }),
    enabled: slots.length > 0 && !!courtId,
    retry: false,
    placeholderData: (prev) => prev,
  });

  const lost = preview.error instanceof ApiError && preview.error.status === 409;
  useEffect(() => {
    if (!lost || slots.length === 0) return;
    router.replace({
      pathname: '/booking/slot-lost',
      params: { courtId, arenaId, date: slots[0].date, start: slots[0].start_time, end: slots[slots.length - 1].end_time },
    });
  }, [lost]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = slots[0];
  const last = slots[slots.length - 1];
  const p = preview.data;
  const loading = arena.isLoading || courts.isLoading || (preview.isLoading && !p);
  const failed = !lost && (arena.isError || courts.isError || (preview.isError && !p));

  const goPay = () =>
    router.push({
      pathname: '/booking/payment',
      params: { courtId, arenaId, slots: slotsParam, equipment: JSON.stringify(picked) },
    });

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Review booking" />
      {slots.length === 0 ? (
        <View style={styles.center}>
          <IconTile>
            <Icon name="cal" size={20} color={Colors.light.text2} />
          </IconTile>
          <Text variant="archivo" style={styles.stateTitle}>
            No time chosen
          </Text>
          <Text style={styles.stateText}>Go back and pick a time first.</Text>
          <View style={styles.stateButton}>
            <Button title="Choose a time" onPress={() => router.back()} />
          </View>
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <View style={[styles.stateIcon, { backgroundColor: Colors.light.redWash }]}>
            <Icon name="cal" size={26} color={Colors.light.red} />
          </View>
          <Text variant="archivo" style={styles.stateTitle}>
            Could not load your booking
          </Text>
          <Text style={styles.stateText}>Check your connection and try again.</Text>
          <View style={styles.stateButton}>
            <Button
              title="Try again"
              onPress={() => {
                arena.refetch();
                courts.refetch();
                preview.refetch();
              }}
            />
          </View>
        </View>
      ) : loading ? (
        <View style={styles.pad}>
          <Skeleton height={72} radius={15} />
          <View style={{ height: 11 }} />
          <Skeleton height={150} radius={15} />
          <View style={{ height: 16 }} />
          <Skeleton height={86} radius={15} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Card style={styles.arenaCard}>
            <View style={styles.art}>
              <CourtArt sport={court?.sport_types[0]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.arenaName} numberOfLines={1}>
                {arena.data?.name}
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {[arena.data?.area, rating.data?.average_rating ? `${Number(rating.data.average_rating).toFixed(1)} ★` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Card>

          <Card style={styles.info}>
            <Line label="Sport" value={court?.sport_types[0] ? sportLabel(court.sport_types[0]) : '—'} />
            <Line label="Date" value={longDate(first.date)} />
            <Line label="Time" value={`${timeRange(first.start_time, last.end_time)} · ${hoursLabel(slots.length)}`} />
            <Line label="Court" value={court?.name ?? '—'} />
            {court?.capacity ? <Line label="Players" value={`Up to ${court.capacity}`} /> : null}
          </Card>

          <Eyebrow>Price</Eyebrow>
          <Card style={styles.priceCard}>
            <Line label={`Slots (${hoursLabel(slots.length)})`} value={p ? formatRs(p.slots_subtotal) : ''} />
            {p && Number(p.equipment_total) > 0 ? <Line label="Extras" value={formatRs(p.equipment_total)} /> : null}
            <Line label="Total" value={p ? formatRs(p.total) : ''} bold />
          </Card>

          {p ? (
            <View style={{ marginTop: 12 }}>
              <Note>{p.cancellation_note}</Note>
            </View>
          ) : null}

          {extras.length > 0 ? (
            <>
              <Eyebrow>Need anything?</Eyebrow>
              <View style={styles.chips}>
                {extras.map((e) => {
                  const on = (picked[e.id] ?? 0) > 0;
                  return (
                    <PressableScale
                      key={e.id}
                      onPress={() => setPicked((s) => ({ ...s, [e.id]: on ? 0 : 1 }))}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${e.name}, ${formatRs(e.rental_price)}`}
                      accessibilityState={{ checked: on }}
                      contentStyle={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {on ? '✓ ' : '+ '}
                        {e.name} {formatRs(e.rental_price)}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      <StickyBar>
        <Button title="Continue to payment" disabled={slots.length === 0 || failed || loading} onPress={goPay} />
      </StickyBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2 },
  arenaCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  art: { width: 60, height: 52, borderRadius: 10, overflow: 'hidden' },
  arenaName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  muted: { fontSize: 14, color: Colors.light.muted, marginTop: 2 },
  info: { padding: 12, marginTop: 11 },
  priceCard: { padding: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 11, justifyContent: 'center', backgroundColor: Colors.light.lineSoft, borderWidth: 1, borderColor: Colors.light.lineSoft },
  chipOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  chipTextOn: { color: Colors.light.paper },
  center: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 18 },
  stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 14 },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 16, textAlign: 'center' },
  stateButton: { width: 200 },
});
