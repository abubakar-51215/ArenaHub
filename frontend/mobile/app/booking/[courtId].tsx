import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { useArena, useArenaCourts } from '@/hooks/useArenas';
import { ApiError } from '@/lib/api';
import { createBooking } from '@/services/bookings';
import { listArenaEquipment } from '@/services/equipment';
import type { PaymentPlan } from '@/types';

interface SelectedSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  price: string;
}

export default function BookingSummaryScreen() {
  const { courtId, slots: slotsParam, arenaId } = useLocalSearchParams<{
    courtId: string;
    slots: string;
    arenaId: string;
  }>();

  const arena = useArena(arenaId);
  const courts = useArenaCourts(arenaId);
  const court = courts.data?.find((c) => c.id === courtId);

  // Passed straight from the slot-selection screen (which already has the
  // full slot objects) rather than re-queried here — avoids re-fetching a
  // slot list for a date this screen doesn't otherwise know.
  const slots: SelectedSlot[] = useMemo(() => {
    try {
      return JSON.parse(slotsParam ?? '[]');
    } catch {
      return [];
    }
  }, [slotsParam]);

  const equipment = useQuery({
    queryKey: ['arena-equipment', arenaId],
    queryFn: () => listArenaEquipment(arenaId),
    enabled: !!arenaId,
  });

  const [selectedEquipment, setSelectedEquipment] = useState<Record<string, number>>({});
  const [paymentType, setPaymentType] = useState<PaymentPlan>('full');
  const [discountCode, setDiscountCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const equipmentTotal = useMemo(() => {
    if (!equipment.data) return 0;
    return equipment.data.reduce((sum, e) => {
      const qty = selectedEquipment[e.id] ?? 0;
      return sum + qty * Number(e.rental_price);
    }, 0);
  }, [equipment.data, selectedEquipment]);

  const slotsTotal = slots.reduce((sum, s) => sum + Number(s.price), 0);
  const estimatedTotal = slotsTotal + equipmentTotal;
  const allowAdvance = arena.data ? !arena.data.require_full_payment : false;

  const mutation = useMutation({
    mutationFn: () =>
      createBooking({
        court_id: courtId,
        slot_ids: slots.map((s) => s.id),
        payment_type: paymentType,
        discount_code: discountCode.trim() || undefined,
        equipment: Object.entries(selectedEquipment)
          .filter(([, qty]) => qty > 0)
          .map(([equipment_id, quantity]) => ({ equipment_id, quantity })),
      }),
    onSuccess: (group) => {
      const actualTotal = group.bookings.reduce((sum, b) => sum + Number(b.total_amount), 0);
      router.replace({
        pathname: '/payment/[groupId]',
        params: {
          groupId: group.booking_group_id,
          amount: String(actualTotal),
          bookingId: group.bookings[0]?.id ?? '',
        },
      });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  if (arena.isLoading || courts.isLoading) {
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
        <Text style={styles.title}>Booking Summary</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.arenaName}>{arena.data?.name}</Text>
          <Text style={styles.arenaLocation}>
            {arena.data?.area ? `${arena.data.area}, ` : ''}
            {arena.data?.city}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Court</Text>
          <Text style={styles.detailValue}>{court?.name ?? '—'}</Text>
        </View>
        {slots.length > 0 ? (
          <>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{slots[0].date}</Text>
            </View>
            {slots.map((s) => (
              <View key={s.id} style={styles.detailRow}>
                <Text style={styles.detailLabel}>Time</Text>
                <Text style={styles.detailValue}>
                  {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} (Rs. {s.price})
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.detailValue}>Slot details unavailable — go back and reselect.</Text>
        )}

        {allowAdvance ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Plan</Text>
            <View style={styles.planRow}>
              {(['full', 'advance'] as PaymentPlan[]).map((plan) => (
                <Pressable
                  key={plan}
                  style={[styles.planChip, paymentType === plan && styles.planChipActive]}
                  onPress={() => setPaymentType(plan)}>
                  <Text style={[styles.planChipText, paymentType === plan && styles.planChipTextActive]}>
                    {plan === 'full' ? 'Pay in Full' : `Pay Advance (${arena.data?.advance_percentage}%)`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {equipment.data && equipment.data.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipment Rental</Text>
            {equipment.data
              .filter((e) => e.is_active && e.quantity_available > 0)
              .map((e) => {
                const qty = selectedEquipment[e.id] ?? 0;
                return (
                  <View key={e.id} style={styles.equipRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.equipName}>{e.name}</Text>
                      <Text style={styles.equipPrice}>Rs. {e.rental_price} /day</Text>
                    </View>
                    <View style={styles.stepper}>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() =>
                          setSelectedEquipment((s) => ({ ...s, [e.id]: Math.max(0, (s[e.id] ?? 0) - 1) }))
                        }>
                        <Text style={styles.stepperBtnText}>−</Text>
                      </Pressable>
                      <Text style={styles.stepperValue}>{qty}</Text>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() =>
                          setSelectedEquipment((s) => ({
                            ...s,
                            [e.id]: Math.min(e.quantity_available, (s[e.id] ?? 0) + 1),
                          }))
                        }>
                        <Text style={styles.stepperBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discount Code</Text>
          <TextField
            placeholder="Enter code (optional)"
            autoCapitalize="characters"
            value={discountCode}
            onChangeText={setDiscountCode}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Court booking</Text>
            <Text style={styles.detailValue}>Rs. {slotsTotal}</Text>
          </View>
          {equipmentTotal > 0 ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Equipment</Text>
              <Text style={styles.detailValue}>Rs. {equipmentTotal}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Text style={styles.totalLabel}>Estimated Total</Text>
            <Text style={styles.totalValue}>Rs. {estimatedTotal}</Text>
          </View>
          {discountCode.trim() ? (
            <Text style={styles.discountHint}>Discount code is applied at checkout.</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Continue to Payment"
          loading={mutation.isPending}
          disabled={slots.length === 0}
          onPress={() => {
            setError(null);
            mutation.mutate();
          }}
        />
      </View>
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
  content: { padding: 20, paddingBottom: 24, gap: 4 },
  card: { backgroundColor: Colors.light.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  arenaName: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  arenaLocation: { fontSize: 12, color: Colors.light.muted, marginTop: 2 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { fontSize: 13, color: Colors.light.muted },
  detailValue: { fontSize: 13, fontWeight: '600', color: Colors.light.text },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.light.text, marginBottom: 10 },
  planRow: { flexDirection: 'row', gap: 10 },
  planChip: { flex: 1, borderWidth: 1, borderColor: Colors.light.border, borderRadius: 10, padding: 12, alignItems: 'center' },
  planChipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  planChipText: { fontSize: 12, fontWeight: '600', color: Colors.light.text, textAlign: 'center' },
  planChipTextActive: { color: '#fff' },
  equipRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  equipName: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  equipPrice: { fontSize: 12, color: Colors.light.muted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontSize: 16, color: Colors.light.text },
  stepperValue: { fontSize: 14, fontWeight: '600', minWidth: 16, textAlign: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  totalValue: { fontSize: 16, fontWeight: '700', color: Colors.light.tint },
  discountHint: { fontSize: 11, color: Colors.light.muted, marginTop: 6 },
  errorText: { color: Colors.light.destructive, fontSize: 13, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
});
