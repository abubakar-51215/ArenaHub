import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { initiatePayment, simulateConfirm, uploadReceipt } from '@/services/payments';
import { uploadImage } from '@/services/uploads';
import type { PaymentMethod } from '@/types';

const METHODS: { value: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'card', label: 'Credit / Debit Card', icon: 'card-outline' },
  { value: 'jazzcash', label: 'JazzCash', icon: 'phone-portrait-outline' },
  { value: 'easypaisa', label: 'EasyPaisa', icon: 'wallet-outline' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline' },
];

export default function PaymentScreen() {
  const { groupId, amount, bookingId } = useLocalSearchParams<{
    groupId: string;
    amount: string;
    bookingId: string;
  }>();
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickReceipt() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  }

  const payMutation = useMutation({
    mutationFn: async () => {
      const { payment } = await initiatePayment(groupId, method);
      if (method === 'bank_transfer') {
        if (!receiptUri) throw new Error('Attach a receipt photo first.');
        const url = await uploadImage(receiptUri, 'receipts');
        await uploadReceipt(payment.id, url);
        return { pendingApproval: true };
      }
      // No real gateway UI here — mirrors the backend's own JazzCash/
      // EasyPaisa dev simulators; confirms the payment without a round trip.
      await simulateConfirm(payment.id, true);
      return { pendingApproval: false };
    },
    onSuccess: ({ pendingApproval }) => {
      router.replace({
        pathname: '/booking/confirmation/[bookingId]',
        params: { bookingId, pendingApproval: pendingApproval ? '1' : '0' },
      });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Payment failed.'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Payment</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Payment Method</Text>
        {METHODS.map((m) => (
          <Pressable
            key={m.value}
            style={[styles.methodRow, method === m.value && styles.methodRowActive]}
            onPress={() => setMethod(m.value)}>
            <Ionicons name={m.icon} size={20} color={Colors.light.text} />
            <Text style={styles.methodLabel}>{m.label}</Text>
            <Ionicons
              name={method === m.value ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={method === m.value ? Colors.light.tint : Colors.light.muted}
            />
          </Pressable>
        ))}

        {method === 'bank_transfer' ? (
          <View style={styles.receiptSection}>
            <Text style={styles.sectionTitle}>Upload Receipt</Text>
            {receiptUri ? (
              <Image source={{ uri: receiptUri }} style={styles.receiptPreview} />
            ) : null}
            <Pressable style={styles.receiptButton} onPress={pickReceipt}>
              <Ionicons name="image-outline" size={18} color={Colors.light.tint} />
              <Text style={styles.receiptButtonText}>
                {receiptUri ? 'Change photo' : 'Attach receipt photo'}
              </Text>
            </Pressable>
            <Text style={styles.receiptHint}>
              The owner reviews bank transfer receipts before confirming your booking.
            </Text>
          </View>
        ) : null}

        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Total Amount</Text>
          <Text style={styles.priceValue}>Rs. {amount}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Button
          title={`Pay Rs. ${amount}`}
          loading={payMutation.isPending}
          onPress={() => {
            setError(null);
            payMutation.mutate();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  content: { flex: 1, padding: 20, gap: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text, marginBottom: 10, marginTop: 12 },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  methodRowActive: { borderColor: Colors.light.tint, backgroundColor: '#EFF6FF' },
  methodLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.light.text },
  receiptSection: { marginTop: 8 },
  receiptPreview: { width: '100%', height: 160, borderRadius: 10, marginBottom: 10, backgroundColor: Colors.light.card },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 12,
  },
  receiptButtonText: { color: Colors.light.tint, fontWeight: '600', fontSize: 13 },
  receiptHint: { fontSize: 11, color: Colors.light.muted, marginTop: 8, lineHeight: 16 },
  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.light.border,
  },
  priceLabel: { fontSize: 14, color: Colors.light.muted },
  priceValue: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  errorText: { color: Colors.light.destructive, fontSize: 13, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.light.border },
});
