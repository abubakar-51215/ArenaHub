import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useCourtSlots } from '@/hooks/useCourtSlots';
import { ApiError } from '@/lib/api';
import { toLocalDateString } from '@/lib/dates';
import { getBooking, rescheduleBooking } from '@/services/bookings';
import type { TimeSlot } from '@/types';

function nextDays(n: number): { date: string; label: string; dayNum: string }[] {
  const days = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: toLocalDateString(d),
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

export default function RescheduleScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(14), []);
  const [selectedDate, setSelectedDate] = useState(days[0].date);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const booking = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
    enabled: !!bookingId,
  });

  const { data: slots, isLoading } = useCourtSlots(booking.data?.court_id, selectedDate);
  const selectedSlot = slots?.find((s) => s.id === selectedSlotId) ?? null;

  const mutation = useMutation({
    mutationFn: () => rescheduleBooking(bookingId, selectedSlotId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      router.back();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not reschedule.'),
  });

  if (booking.isLoading || !booking.data) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={Colors.light.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Reschedule Booking</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.currentSlot}>
        Currently: {booking.data.booking_date} · {booking.data.start_time.slice(0, 5)}–
        {booking.data.end_time.slice(0, 5)}
      </Text>

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
            const bookable = item.status === 'available' && item.id !== booking.data.slot_id;
            const active = item.id === selectedSlotId;
            return (
              <Pressable
                disabled={!bookable}
                style={[styles.slot, !bookable && styles.slotDisabled, active && styles.slotActive]}
                onPress={() => setSelectedSlotId(item.id)}>
                <Text style={[styles.slotText, active && styles.slotTextActive]}>
                  {item.start_time.slice(0, 5)}
                </Text>
                {!bookable ? (
                  <Text style={styles.slotStatus}>
                    {item.id === booking.data.slot_id ? 'Current' : STATUS_LABEL[item.status]}
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No slots generated for this date yet.</Text>}
        />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {selectedSlot ? (
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerLabel}>
              New: {selectedSlot.start_time.slice(0, 5)} – {selectedSlot.end_time.slice(0, 5)}
            </Text>
            <Text style={styles.footerHint}>Price stays the same.</Text>
          </View>
          <Button
            title="Confirm"
            loading={mutation.isPending}
            onPress={() => {
              setError(null);
              mutation.mutate();
            }}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  currentSlot: { fontSize: 12, color: Colors.light.muted, paddingHorizontal: 16, paddingBottom: 8 },
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
  errorText: { color: Colors.light.destructive, fontSize: 13, marginHorizontal: 16, marginTop: 8 },
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
  footerLabel: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  footerHint: { fontSize: 11, color: Colors.light.muted, marginTop: 2 },
});
