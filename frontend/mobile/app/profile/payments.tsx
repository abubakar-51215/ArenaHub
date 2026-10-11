import { useMutation, useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import { router, type Href } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusPill, type PillTone } from '@/components/booking/parts';
import { IconExtra } from '@/components/ui/icon-extra';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { formatDate } from '@/lib/karachi';
import { formatRs } from '@/lib/money';
import { fetchReceiptPdf, listMyPayments } from '@/services/payments';
import type { PaymentHistoryItem, PaymentMethod } from '@/types';

// Payment history, from arena-hub-player-app-account.html (frame 14): every payment as a "minus" line and every refund taken
// from it as a "plus" line, each with its booking code, the date and how it went. A paid payment also has a Receipt link
// (the PDF, kept from the older screen). Tapping a line opens the booking.
const METHOD: Record<PaymentMethod, string> = { card: 'Card', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', bank_transfer: 'Bank transfer' };

function paymentPill(p: PaymentHistoryItem): { label: string; tone: PillTone } {
  if (p.status === 'completed') return { label: 'Paid', tone: 'ok' };
  if (p.status === 'failed') return { label: p.lifecycle_status === 'rejected' ? 'Rejected' : 'Failed', tone: 'off' };
  if (p.lifecycle_status === 'expired') return { label: 'Not paid', tone: 'idle' };
  if (p.lifecycle_status === 'pending_approval') return { label: 'Awaiting approval', tone: 'wait' };
  return { label: 'Not paid yet', tone: 'wait' };
}

type Row = { key: string; kind: 'payment' | 'refund'; p: PaymentHistoryItem; amount: string; pill: { label: string; tone: PillTone }; date: string };

function buildRows(items: PaymentHistoryItem[]): Row[] {
  const rows: Row[] = [];
  for (const p of items) {
    rows.push({ key: p.id, kind: 'payment', p, amount: p.amount, pill: paymentPill(p), date: p.created_at });
    for (const r of p.refunds ?? []) {
      rows.push({
        key: r.id,
        kind: 'refund',
        p,
        amount: r.amount,
        pill: r.status === 'processed' ? { label: 'Refunded', tone: 'idle' } : r.status === 'failed' ? { label: 'Refund failed', tone: 'off' } : { label: 'Refund pending', tone: 'wait' },
        date: r.processed_at ?? r.created_at,
      });
    }
  }
  return rows;
}

function RowCard({ row, onReceipt, receiptBusy }: { row: Row; onReceipt: (p: PaymentHistoryItem) => void; receiptBusy: boolean }) {
  const { p } = row;
  const refund = row.kind === 'refund';
  const sub = refund ? 'Refund' : `${formatDate(row.date)} · ${METHOD[p.payment_method]}`;
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => router.push({ pathname: '/booking/detail/[groupId]', params: { groupId: p.booking_group_id } } as unknown as Href)}
        accessibilityRole="button"
        accessibilityLabel={`${p.arena_name ?? 'Booking'}, ${refund ? 'refund' : 'payment'} ${formatRs(row.amount)}, ${row.pill.label}`}
        style={styles.main}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={2}>
            {[p.arena_name, p.booking_code].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[styles.amount, refund && { color: Colors.light.limeDeep }]}>
            {refund ? '+ ' : '− '}
            {formatRs(row.amount)}
          </Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.sub}>{sub}</Text>
          <StatusPill label={row.pill.label} tone={row.pill.tone} />
        </View>
      </Pressable>
      {!refund && p.status === 'completed' ? (
        <Pressable onPress={() => onReceipt(p)} disabled={receiptBusy} accessibilityRole="button" accessibilityLabel={`Receipt for ${p.booking_code ?? 'this payment'}`} style={styles.receipt}>
          <IconExtra name="receipt" size={16} color={Colors.light.limeDeep} />
          <Text style={styles.receiptText}>{receiptBusy ? 'Preparing…' : 'Receipt'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function PaymentHistoryScreen() {
  const q = useQuery({ queryKey: ['my-payments'], queryFn: () => listMyPayments(), retry: 1 });
  const rows = useMemo(() => buildRows(q.data?.items ?? []), [q.data]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  const receipt = useMutation({
    mutationFn: async (payment: PaymentHistoryItem) => {
      const bytes = await fetchReceiptPdf(payment.id);
      const file = new File(Paths.cache, `receipt-${payment.id}.pdf`);
      if (file.exists) file.delete();
      file.create();
      file.write(bytes);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
    },
    onError: () => showToast('Could not get the receipt. Please try again.'),
  });

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Payment history" />
      {q.isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.card, { padding: 14, gap: 10 }]}>
              <Skeleton height={14} width="70%" radius={7} />
              <Skeleton height={14} width="40%" radius={7} />
            </View>
          ))}
        </View>
      ) : q.isError && !q.data ? (
        <ErrorState title="Could not load your payments." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => <RowCard row={item} onReceipt={(p) => !receipt.isPending && receipt.mutate(p)} receiptBusy={receipt.isPending && receipt.variables?.id === item.p.id} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            <EmptyState icon={<IconExtra name="receipt" size={30} color={Colors.light.limeDeep} />} title="No payments yet." text="Payments and refunds for your bookings will show up here." />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  list: { paddingHorizontal: 18, paddingTop: 6, paddingBottom: 24, flexGrow: 1 },
  card: { backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15, marginBottom: 10, overflow: 'hidden' },
  main: { padding: 14, gap: 10, minHeight: 60 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.light.text },
  amount: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  sub: { fontSize: 14, color: Colors.light.muted },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: Colors.light.lineSoft },
  receiptText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeDeep },
});
