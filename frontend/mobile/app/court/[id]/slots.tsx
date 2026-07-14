import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ArenaCard } from '@/components/arena-card';
import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useArena, useArenaCourts } from '@/hooks/useArenas';
import { useCourtSlots } from '@/hooks/useCourtSlots';
import { getRecommendations } from '@/services/ai';
import type { TimeSlot } from '@/types';

function nextDays(n: number): { date: string; label: string; dayNum: string }[] {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: String(d.getDate()),
    });
  }
  return days;
}

const STATUS_LABEL: Record<TimeSlot['status'], string> = {
  available: 'Available',
  reserved: 'Held',
  booked: 'Booked',
  maintenance: 'Blocked',
};

// Mirrors backend/app/modules/booking/schema.py's MAX_SLOTS_PER_BOOKING.
const MAX_SLOTS_PER_BOOKING = 8;

export default function SlotSelectionScreen() {
  const { id: courtId, arenaId } = useLocalSearchParams<{ id: string; arenaId: string }>();
  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0].date);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);

  const { data: slots, isLoading } = useCourtSlots(courtId, selectedDate);
  const selectedSlots = useMemo(
    () =>
      (slots ?? [])
        .filter((s) => selectedSlotIds.includes(s.id))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [slots, selectedSlotIds],
  );
  const totalPrice = selectedSlots.reduce((sum, s) => sum + Number(s.price), 0);

  function toggleSlot(slotId: string) {
    setSelectedSlotIds((ids) => {
      if (ids.includes(slotId)) return ids.filter((id) => id !== slotId);
      if (ids.length >= MAX_SLOTS_PER_BOOKING) return ids;
      return [...ids, slotId];
    });
  }

  const arena = useArena(arenaId);
  const courts = useArenaCourts(arenaId);
  // A slot is peak-priced when its snapshot price exceeds the court's base
  // rate (the peak multiplier is baked in at slot-generation time).
  const basePrice = Number(courts.data?.find((c) => c.id === courtId)?.base_price ?? 0);
  const isFullyBooked = !!slots?.length && !slots.some((s) => s.status === 'available');
  const alternatives = useQuery({
    queryKey: ['alternatives', arenaId, arena.data?.city],
    queryFn: () => getRecommendations({ city: arena.data?.city, limit: 6 }),
    enabled: isFullyBooked && !!arena.data,
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Select Date & Time</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={days}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(d) => d.date}
        contentContainerStyle={styles.dateStrip}
        renderItem={({ item }) => {
          const active = item.date === selectedDate;
          return (
            <Pressable
              style={[styles.dateChip, active && styles.dateChipActive]}
              onPress={() => {
                setSelectedDate(item.date);
                setSelectedSlotIds([]);
              }}>
              <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>{item.label}</Text>
              <Text style={[styles.dateChipNum, active && styles.dateChipTextActive]}>{item.dayNum}</Text>
            </Pressable>
          );
        }}
      />

      {isLoading ? (
        <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={slots ?? []}
          keyExtractor={(s) => s.id}
          numColumns={3}
          columnWrapperStyle={styles.slotRow}
          contentContainerStyle={styles.slotGrid}
          renderItem={({ item }) => {
            const bookable = item.status === 'available';
            const active = selectedSlotIds.includes(item.id);
            const isPeak = basePrice > 0 && Number(item.price) > basePrice;
            return (
              <Pressable
                disabled={!bookable}
                style={[
                  styles.slot,
                  isPeak && styles.slotPeak,
                  !bookable && styles.slotDisabled,
                  active && styles.slotActive,
                ]}
                onPress={() => toggleSlot(item.id)}>
                <Text style={[styles.slotText, active && styles.slotTextActive]}>
                  {item.start_time.slice(0, 5)}
                </Text>
                {bookable ? (
                  <View style={styles.slotPriceRow}>
                    {isPeak ? (
                      <Ionicons name="flash" size={9} color={active ? '#fff' : Colors.light.warning} />
                    ) : null}
                    <Text
                      style={[
                        styles.slotPrice,
                        isPeak && !active && styles.slotPricePeak,
                        active && styles.slotTextActive,
                      ]}>
                      Rs. {Number(item.price)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.slotStatus}>{STATUS_LABEL[item.status]}</Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No slots generated for this date yet.</Text>}
          ListFooterComponent={
            isFullyBooked && alternatives.data?.items.length ? (
              <View style={styles.alternatives}>
                <Text style={styles.alternativesTitle}>Fully booked — try these nearby</Text>
                <FlatList
                  data={alternatives.data.items.filter((a) => a.id !== arenaId)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(a) => a.id}
                  contentContainerStyle={{ gap: 12 }}
                  renderItem={({ item }) => <ArenaCard arena={item} width={160} />}
                />
              </View>
            ) : null
          }
        />
      )}

      {selectedSlots.length > 0 ? (
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerLabel}>
              {selectedSlots.length} slot{selectedSlots.length > 1 ? 's' : ''} selected
            </Text>
            <Text style={styles.footerPrice}>Rs. {totalPrice}</Text>
          </View>
          <Button
            title="Continue"
            onPress={() =>
              router.push({
                pathname: '/booking/[courtId]',
                params: {
                  courtId: courtId as string,
                  arenaId: arenaId as string,
                  slots: JSON.stringify(
                    selectedSlots.map((s) => ({
                      id: s.id,
                      date: s.date,
                      start_time: s.start_time,
                      end_time: s.end_time,
                      price: s.price,
                    })),
                  ),
                },
              })
            }
          />
        </View>
      ) : null}
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
  dateStrip: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  dateChip: {
    width: 52,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  dateChipDay: { fontSize: 11, color: Colors.light.muted },
  dateChipNum: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 2 },
  dateChipTextActive: { color: '#fff' },
  slotGrid: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  slotRow: { gap: 10 },
  slot: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  slotDisabled: { backgroundColor: Colors.light.card, borderColor: Colors.light.border },
  slotActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  slotPeak: { borderColor: Colors.light.warning },
  slotText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  slotTextActive: { color: '#fff' },
  slotStatus: { fontSize: 9, color: Colors.light.muted, marginTop: 2 },
  slotPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  slotPrice: { fontSize: 9, color: Colors.light.muted },
  slotPricePeak: { color: Colors.light.warning, fontWeight: '600' },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 24 },
  alternatives: { marginTop: 20 },
  alternativesTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginBottom: 10 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  footerLabel: { fontSize: 12, color: Colors.light.muted },
  footerPrice: { fontSize: 18, fontWeight: '700', color: Colors.light.text },
});
