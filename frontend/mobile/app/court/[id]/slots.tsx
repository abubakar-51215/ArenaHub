import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useCourtSlots } from '@/hooks/useCourtSlots';
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

export default function SlotSelectionScreen() {
  const { id: courtId } = useLocalSearchParams<{ id: string }>();
  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0].date);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const { data: slots, isLoading } = useCourtSlots(courtId, selectedDate);
  const selectedSlot = slots?.find((s) => s.id === selectedSlotId) ?? null;

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
                setSelectedSlotId(null);
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
            const active = item.id === selectedSlotId;
            return (
              <Pressable
                disabled={!bookable}
                style={[
                  styles.slot,
                  !bookable && styles.slotDisabled,
                  active && styles.slotActive,
                ]}
                onPress={() => setSelectedSlotId(item.id)}>
                <Text style={[styles.slotText, active && styles.slotTextActive]}>
                  {item.start_time.slice(0, 5)}
                </Text>
                {!bookable ? (
                  <Text style={styles.slotStatus}>{STATUS_LABEL[item.status]}</Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No slots generated for this date yet.</Text>}
        />
      )}

      {selectedSlot ? (
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerLabel}>
              Selected: {selectedSlot.start_time.slice(0, 5)} – {selectedSlot.end_time.slice(0, 5)}
            </Text>
            <Text style={styles.footerPrice}>Rs. {selectedSlot.price}</Text>
          </View>
          <Button
            title="Continue"
            onPress={() =>
              router.push({
                pathname: '/booking/[courtId]',
                params: { courtId: courtId as string, slotIds: selectedSlot.id },
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
  slotText: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  slotTextActive: { color: '#fff' },
  slotStatus: { fontSize: 9, color: Colors.light.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 24 },
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
