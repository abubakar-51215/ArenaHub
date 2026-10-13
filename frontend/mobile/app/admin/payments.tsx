import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, KV, ListCard, LoadError, Nothing, Pill, SkeletonCards, type PillTone } from '@/components/admin/kit';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { ScreenHead } from '@/components/ui/screen-head';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY, actionFailed } from '@/hooks/useAdmin';
import { successHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { listAdminPayments, listAdminRefunds, markRefundPaid, type AdminPayment, type AdminRefund } from '@/services/admin';
import { dotJoin } from '@/lib/text';

// Payments and refunds (arena-hub-admin-app.html: Payments list, Refunds waiting, Refunds empty, Mark paid sheet and toast, error).
type Tab = 'payments' | 'refunds';
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/more' as Href));
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };

function paymentLook(p: AdminPayment): { label: string; tone: PillTone } {
  if (p.lifecycle_status === 'refunded') return { label: 'Refunded', tone: 'idle' };
  if (p.status === 'completed') return { label: 'Paid', tone: 'ok' };
  if (p.status === 'pending') return { label: 'Waiting', tone: 'wait' };
  return { label: 'Not paid', tone: 'off' };
}

export default function PaymentsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(tabParam === 'refunds' ? 'refunds' : 'payments');
  const qc = useQueryClient();
  const payments = useQuery({ queryKey: [ADMIN_KEY, 'payments'], queryFn: listAdminPayments, enabled: tab === 'payments', retry: 1 });
  const refunds = useQuery({ queryKey: [ADMIN_KEY, 'refunds'], queryFn: () => listAdminRefunds('pending'), enabled: tab === 'refunds', retry: 1 });
  const q = tab === 'payments' ? payments : refunds;
  const [asking, setAsking] = useState<AdminRefund | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pay = useMutation({
    mutationFn: (id: string) => markRefundPaid(id),
    onSuccess: (r) => {
      successHaptic();
      setAsking(null);
      showToast(r.already_processed ? 'Already marked as paid.' : 'Marked as paid. The player has been told.');
      qc.invalidateQueries({ queryKey: [ADMIN_KEY] });
    },
    onError: (err) => {
      setAsking(null);
      actionFailed(err, 'Could not save. Please try again.');
      qc.invalidateQueries({ queryKey: [ADMIN_KEY, 'refunds'] });
    },
  });

  const list = refunds.data?.items ?? [];
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Payments and refunds" onBack={back} />
      <View style={styles.seg}>
        <Segmented<Tab>
          options={[
            { value: 'payments', label: 'Payments' },
            { value: 'refunds', label: 'Refunds' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await q.refetch();
              setRefreshing(false);
            }}
          />
        }
        showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards />
        ) : q.isError && !q.data ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : tab === 'payments' ? (
          (payments.data?.items ?? []).length === 0 ? (
            <Nothing title="No payments yet." text="Payments will show here." />
          ) : (
            (payments.data?.items ?? []).map((p) => {
              const look = paymentLook(p);
              return (
                <ListCard
                  key={p.id}
                  title={p.booking_code}
                  sub={dotJoin([p.player_name, METHOD[p.payment_method] ?? p.payment_method])}
                  right={
                    <View style={styles.amount}>
                      <Text style={styles.amountText}>{formatRs(p.amount)}</Text>
                      <Pill label={look.label} tone={look.tone} />
                    </View>
                  }
                />
              );
            })
          )
        ) : list.length === 0 ? (
          <Nothing title="No refunds waiting." text="Every refund has been paid." />
        ) : (
          <>
            <View style={styles.note}>
              <Text style={styles.noteText}>The arena owner sends these refunds. Use Mark as paid only if the owner cannot.</Text>
            </View>
            {list.map((r) => (
              <Card key={r.id} style={styles.refund}>
                <View style={styles.rTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rName}>{r.player_name}</Text>
                    <Text style={styles.rSub}>
                      {r.booking_code} · {r.arena_name}
                    </Text>
                  </View>
                  <Text style={styles.rName}>{formatRs(r.amount)}</Text>
                </View>
                {r.reason ? <Text style={styles.rReason}>{r.reason}</Text> : null}
                {r.can_mark_paid ? <Button title="Mark as paid" variant="ghost" offlineLabel="Mark as paid needs a connection" onPress={() => setAsking(r)} /> : null}
              </Card>
            ))}
          </>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={!!asking}
        title="Mark this refund as paid?"
        message="Only do this after the money has been sent. The player will be told it is done. This cannot be undone."
        confirmLabel="Yes, mark as paid"
        cancelLabel="Not yet"
        destructive={false}
        stacked
        loading={pay.isPending}
        offlineLabel="Mark as paid needs a connection"
        onConfirm={() => asking && pay.mutate(asking.id)}
        onCancel={() => setAsking(null)}>
        {asking ? (
          <Card style={{ marginTop: 12, paddingVertical: 6 }}>
            <KV k="Player" v={asking.player_name} />
            <KV k="Booking" v={asking.booking_code} />
            <KV k="Amount" v={formatRs(asking.amount)} />
          </Card>
        ) : null}
      </ConfirmSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  seg: { paddingHorizontal: 18, paddingBottom: 10 },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  amount: { alignItems: 'flex-end', gap: 4, flexShrink: 0 },
  amountText: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  note: { padding: 12, borderRadius: 12, backgroundColor: Colors.light.limeWash, borderWidth: 1, borderColor: Colors.light.limeDeep, marginBottom: 12 },
  noteText: { fontSize: 14, lineHeight: 20, color: Colors.light.text },
  refund: { padding: 14, marginBottom: 10, gap: 8 },
  rTop: { flexDirection: 'row', gap: 10 },
  rName: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  rSub: { fontSize: 14, color: Colors.light.muted, lineHeight: 20 },
  rReason: { fontSize: 14, color: Colors.light.muted, lineHeight: 20 },
});
