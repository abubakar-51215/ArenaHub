import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CardIcon, Line, PhoneIcon, StatusPill } from '@/components/booking/parts';
import { Circle, ResultScreen } from '@/components/booking/result';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useBackTo } from '@/hooks/useBackTo';
import { shortDate, timeRange } from '@/lib/checkout';
import { formatRs } from '@/lib/money';
import { BALANCE_TEXT, PAY_TEXT, type WalletName } from '@/lib/payment-text';
import { getBookingGroup } from '@/services/bookings';
import { listMyPayments, simulatePayment } from '@/services/payments';
import { useCheckout } from '@/store/checkout';

// Waiting for a card or wallet payment. Paid by card or in the wallet app = the booking is
// confirmed at once, with no owner step: the screen checks every 3 seconds and moves on to
// Booking confirmed, or to Payment failed when the payment is declined or the card page is
// given up. Bank transfer has its own screens (receipt, then the owner approves).
const WALLETS: Record<string, WalletName> = { jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };

export default function PaymentProcessingScreen() {
  useBackTo('/(tabs)/bookings');
  const { groupId, paymentId, method, page, masked, balance } = useLocalSearchParams<{
    groupId: string;
    paymentId: string;
    method: string;
    page?: string;
    masked?: string;
    balance?: string;
  }>();
  // waiting for a balance payment on a confirmed booking: the booking stays as it is, the payment decides
  const balanceMode = balance === '1';
  const qc = useQueryClient();
  const forget = useCheckout((s) => s.forget);
  useEffect(() => forget(), [forget]);
  const wallet = WALLETS[method ?? ''];

  const group = useQuery({
    queryKey: ['booking-group', groupId],
    queryFn: () => getBookingGroup(groupId),
    refetchInterval: 3000,
  });
  const g = group.data;
  const mine = useQuery({
    queryKey: ['my-payments', 'balance-wait', paymentId],
    queryFn: listMyPayments,
    enabled: balanceMode,
    refetchInterval: 3000,
  });
  const balancePayment = mine.data?.items.find((x) => x.id === paymentId);
  useEffect(() => {
    if (!balanceMode || !balancePayment) return;
    if (balancePayment.status === 'completed' || balancePayment.status === 'failed') {
      qc.invalidateQueries({ queryKey: ['booking-group', groupId] });
      qc.invalidateQueries({ queryKey: ['booking-groups'] });
      showToast(balancePayment.status === 'completed' ? BALANCE_TEXT.paidToast : BALANCE_TEXT.failedToast);
      router.dismissTo({ pathname: '/booking/detail/[groupId]', params: { groupId } });
    }
  }, [balanceMode, balancePayment, groupId, qc]);
  useEffect(() => {
    if (!g || balanceMode) return;
    if (g.status === 'confirmed') router.replace({ pathname: '/booking/confirmed/[groupId]', params: { groupId } });
    else if (g.status === 'rejected' || g.status === 'cancelled')
      router.replace({ pathname: '/booking/failed/[groupId]', params: { groupId, arenaId: g.arena_id, courtId: g.court_id } });
  }, [g, groupId, balanceMode]);

  const [busy, setBusy] = useState(false);
  async function devFinish(success: boolean) {
    setBusy(true);
    try {
      await simulatePayment(paymentId, success);
      await group.refetch();
      if (balanceMode) await mine.refetch();
    } catch {
      showToast('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function reopen() {
    if (page) await WebBrowser.openAuthSessionAsync(page, Linking.createURL('booking/return'));
    await group.refetch();
  }

  return (
    <ResultScreen
      mark={<Circle bg={Colors.light.amberWash}>{wallet ? <PhoneIcon size={30} color={Colors.light.amber} /> : <CardIcon size={30} color={Colors.light.amber} />}</Circle>}
      title={wallet ? PAY_TEXT.walletTitle(wallet) : PAY_TEXT.cardTitle}
      text={wallet ? PAY_TEXT.walletText(wallet, masked || '') : PAY_TEXT.cardText}
      buttons={
        <>
          {!wallet && page ? <Button title={PAY_TEXT.cardReopen} onPress={() => void reopen()} /> : null}
          {__DEV__ && wallet ? (
            <>
              <Button title={PAY_TEXT.devApprove} loading={busy} onPress={() => void devFinish(true)} />
              <Button title={PAY_TEXT.devDecline} variant="ghost" disabled={busy} onPress={() => void devFinish(false)} />
            </>
          ) : null}
          <Button title="View my bookings" variant="ghost" onPress={() => router.replace('/(tabs)/bookings')} />
        </>
      }>
      {g ? (
        <Card style={{ padding: 12 }}>
          <Line label="Booking" value={g.booking_code} />
          <Line label="Time" value={`${shortDate(g.booking_date)} · ${timeRange(g.start_time, g.end_time)}`} />
          <Line label="Amount" value={formatRs(balanceMode ? (balancePayment?.amount ?? g.balance_due) : g.pay_now)} />
          <Line label="Status" value={<StatusPill tone="wait" label={PAY_TEXT.waiting} />} />
        </Card>
      ) : (
        <View>
          <Skeleton height={140} radius={15} />
        </View>
      )}
    </ResultScreen>
  );
}
