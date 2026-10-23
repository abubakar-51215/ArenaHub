import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, IconTile, Line, Note } from '@/components/booking/parts';
import { ReceiptBox } from '@/components/booking/receipt-box';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useLeaveCheckout } from '@/hooks/useLeaveCheckout';
import { ApiError } from '@/lib/api';
import { errorHaptic, tapHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { BALANCE_TEXT } from '@/lib/payment-text';
import { getBankDetails } from '@/services/arenas';
import { getBookingGroup } from '@/services/bookings';
import { uploadReceipt } from '@/services/payments';
import { photoProblem, uploadImage, UploadAbortedError, UploadNetworkError, type PhotoProblem } from '@/services/uploads';

// Bank transfer, from arena-hub-player-app-booking-payment.html (frame 5). The
// arena's own account details come from its bank-transfer settings. The person
// sends the exact amount, uploads a photo of the receipt and waits for the
// arena to confirm. Receipts are photos (JPG or PNG, up to 5 MB): the server
// does not take PDFs yet.
export default function BankTransferScreen() {
  const { groupId, paymentId, arenaId, balance } = useLocalSearchParams<{ groupId: string; paymentId: string; arenaId: string; balance?: string }>();
  // paying the balance of a booking that is already confirmed: that booking is never given up here
  const balanceMode = balance === '1';
  const qc = useQueryClient();
  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId), retry: false });
  const arena = group.data?.arena_id ?? arenaId;
  const banks = useQuery({ queryKey: ['bank-details', arena], queryFn: () => getBankDetails(arena), enabled: !!arena, retry: false });
  const account = banks.data?.find((a) => a.is_default) ?? banks.data?.[0];
  const { back, sheet } = useLeaveCheckout(balanceMode ? undefined : groupId, arena);

  const [photo, setPhoto] = useState<{ uri: string; name: string } | null>(null);
  // what the receipt box shows: ready, uploading (with a percentage), stopped, failed, or a photo that cannot be used
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'stopped' | 'failed'>('idle');
  const [pct, setPct] = useState(0);
  const [failMessage, setFailMessage] = useState('Upload failed. Check your connection.');
  const [bad, setBad] = useState<PhotoProblem | null>(null);
  const [stopSheet, setStopSheet] = useState(false);
  const sending = useRef(false);
  const picker = usePhotoPicker({ quality: 0.7 });
  const abort = useRef<AbortController | null>(null);

  // already sent, confirmed or let go: open the screen that matches
  useEffect(() => {
    const g = group.data;
    if (!g) return;
    if (balanceMode) {
      if (g.balance_payment === 'awaiting_approval' || !(Number(g.balance_due) > 0)) router.dismissTo({ pathname: '/booking/detail/[groupId]', params: { groupId } });
      return;
    }
    if (g.status === 'pending_approval') router.replace({ pathname: '/booking/awaiting/[groupId]', params: { groupId } });
    else if (g.status === 'confirmed') router.replace({ pathname: '/booking/confirmed/[groupId]', params: { groupId } });
    else if (g.status === 'cancelled' || g.status === 'rejected') router.replace({ pathname: '/booking/failed/[groupId]', params: { groupId, arenaId: g.arena_id, courtId: g.court_id } });
  }, [group.data, groupId, balanceMode]);

  async function choose() {
    if (sending.current) return;
    tapHaptic();
    const a = await picker.choose();
    if (a) {
      const problem = photoProblem(a, 'receipt');
      if (problem) {
        errorHaptic();
        setBad(problem);
        setPhoto(null);
        setPhase('idle');
        return;
      }
      setBad(null);
      setPhase('idle');
      setPhoto({ uri: a.uri, name: a.fileName ?? 'receipt.jpg' });
    }
  }
  async function copy() {
    if (!account) return;
    try {
      await Clipboard.setStringAsync(account.account_number);
      showToast('Account number copied');
    } catch {
      showToast('Could not copy. Select the number and copy it.');
    }
  }
  async function send() {
    if (sending.current || !photo) return;
    sending.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setPct(0);
    setPhase('uploading');
    try {
      const url = await uploadImage(photo.uri, 'receipts', { signal: controller.signal, onProgress: setPct });
      await uploadReceipt(paymentId, url);
      if (balanceMode) {
        qc.invalidateQueries({ queryKey: ['booking-group', groupId] });
        qc.invalidateQueries({ queryKey: ['booking-groups'] });
        showToast(BALANCE_TEXT.receiptSent);
        router.dismissTo({ pathname: '/booking/detail/[groupId]', params: { groupId } });
        return;
      }
      router.replace({ pathname: '/booking/awaiting/[groupId]', params: { groupId } });
    } catch (e) {
      if (e instanceof UploadAbortedError) {
        // the person stopped it: nothing to report, the "Upload stopped" state shows
        setPhase('stopped');
        setPhoto(null);
      } else {
        errorHaptic();
        setFailMessage(e instanceof UploadNetworkError ? e.message : e instanceof ApiError && e.message ? e.message : 'Upload failed. Check your connection.');
        setPhase('failed');
      }
    } finally {
      sending.current = false;
      abort.current = null;
    }
  }

  const loading = group.isLoading || banks.isLoading;
  const noAccount = banks.isError && banks.error instanceof ApiError && banks.error.status === 404;
  const failed = !loading && (group.isError || (banks.isError && !noAccount));
  const ready = !!group.data && !!account;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Bank transfer" onBack={back} />
      {failed || noAccount ? (
        <View style={styles.center}>
          <IconTile tone="red">
            <Icon name="cal" size={20} color={Colors.light.red} />
          </IconTile>
          <Text variant="archivo" style={styles.stateTitle}>
            {noAccount ? 'No account to pay into yet' : 'Could not load the bank details'}
          </Text>
          <Text style={styles.stateText}>{noAccount ? 'This arena has not added its bank account yet. Leave and pick another way or time.' : 'Check your connection and try again.'}</Text>
          {noAccount ? null : (
            <View style={{ width: 200 }}>
              <Button
                title="Try again"
                onPress={() => {
                  group.refetch();
                  banks.refetch();
                }}
              />
            </View>
          )}
        </View>
      ) : loading || !ready ? (
        <View style={styles.pad}>
          <Skeleton height={64} radius={11} />
          <View style={{ height: 12 }} />
          <Skeleton height={200} radius={15} />
          <View style={{ height: 16 }} />
          <Skeleton height={110} radius={15} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Note>
            {balanceMode ? BALANCE_TEXT.bankNote : 'Your time is booked once the arena confirms your receipt. Send the exact amount, then upload the receipt.'}
            {account.payment_instructions ? ` ${account.payment_instructions}` : ''}
          </Note>
          <Card style={styles.details}>
            <Line label="Amount" value={formatRs(balanceMode ? group.data.balance_due : group.data.pay_now)} />
            <Line label="Bank" value={account.bank_name} />
            <Line label="Account title" value={account.account_title} />
            <Line label="Account no." value={account.account_number} />
            <Line label="Reference" value={group.data.booking_code} />
            <View style={{ height: 8 }} />
            <Button title="Copy account number" variant="ghost" onPress={copy} />
          </Card>

          <Eyebrow>Your receipt</Eyebrow>
          <ReceiptBox
            state={
              bad
                ? { kind: 'bad', title: bad.title, text: bad.text }
                : phase === 'uploading' && photo
                  ? { kind: 'uploading', name: photo.name, pct }
                  : phase === 'failed' && photo
                    ? { kind: 'failed', name: photo.name, message: failMessage }
                    : phase === 'stopped'
                      ? { kind: 'stopped' }
                      : photo
                        ? { kind: 'ready', name: photo.name }
                        : { kind: 'empty' }
            }
            onChoose={choose}
            onCancel={() => setStopSheet(true)}
            onRetry={send}
          />
        </ScrollView>
      )}
      <StickyBar>
        <Button title="Send receipt" offlineLabel="Send needs a connection" disabled={!ready || !photo || phase === 'uploading' || phase === 'failed'} onPress={send} />
      </StickyBar>
      {sheet}
      {picker.sheet}
      <ConfirmSheet
        visible={stopSheet}
        title="Stop uploading?"
        message="Your receipt will not be sent. You can choose a photo again."
        confirmLabel="Yes, stop upload"
        cancelLabel="Keep uploading"
        stacked
        onConfirm={() => {
          setStopSheet(false);
          abort.current?.abort();
        }}
        onCancel={() => setStopSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 20 },
  details: { padding: 12, marginTop: 12 },
  drop: { alignItems: 'center', padding: 16, minHeight: 110, backgroundColor: Colors.light.card, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.light.line, borderRadius: 15 },
  dropTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  dropText: { fontSize: 14, color: Colors.light.muted, marginTop: 3 },
  center: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 18 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text, marginTop: 14 },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 16, textAlign: 'center' },
});
