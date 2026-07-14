import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { fetchReceiptPdf, listMyPayments } from '@/services/payments';
import type { PaymentHistoryItem, PaymentMethod, PaymentStatus } from '@/types';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'Card',
  jazzcash: 'JazzCash',
  easypaisa: 'EasyPaisa',
  bank_transfer: 'Bank Transfer',
};

const STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: Colors.light.warning,
  completed: Colors.light.success,
  failed: Colors.light.destructive,
  refunded: Colors.light.muted,
};

export default function PaymentHistoryScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => listMyPayments(),
  });

  const receiptMutation = useMutation({
    mutationFn: async (payment: PaymentHistoryItem) => {
      const bytes = await fetchReceiptPdf(payment.id);
      const file = new File(Paths.cache, `receipt-${payment.id}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
      }
    },
    onError: () => Alert.alert('Could not download receipt', 'Please try again.'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>Payment History</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.light.tint} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.arenaName} numberOfLines={1}>
                  {item.arena_name ?? 'Arena'}
                </Text>
                <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                  {item.status}
                </Text>
              </View>
              <Text style={styles.meta}>
                {METHOD_LABEL[item.payment_method]} · {item.booking_date ?? item.created_at.slice(0, 10)}
              </Text>
              <View style={styles.row}>
                <Text style={styles.amount}>
                  Rs. {item.amount} {item.payment_type === 'advance' ? '(advance)' : ''}
                </Text>
                {item.status === 'completed' ? (
                  <Pressable
                    style={styles.receiptBtn}
                    disabled={receiptMutation.isPending}
                    onPress={() => receiptMutation.mutate(item)}>
                    {receiptMutation.isPending && receiptMutation.variables?.id === item.id ? (
                      <ActivityIndicator size="small" color={Colors.light.tint} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={14} color={Colors.light.tint} />
                        <Text style={styles.receiptBtnText}>Receipt</Text>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No payments yet.</Text>}
        />
      )}
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
  list: { padding: 20, paddingTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  arenaName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  status: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: Colors.light.muted },
  amount: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  receiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  receiptBtnText: { fontSize: 12, fontWeight: '600', color: Colors.light.tint },
  empty: { textAlign: 'center', color: Colors.light.muted, marginTop: 32 },
});
