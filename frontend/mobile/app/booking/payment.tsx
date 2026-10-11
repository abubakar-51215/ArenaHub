import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BankIcon, CardIcon, Eyebrow, IconTile, Line, PhoneIcon, SecureBadge } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useLeaveCheckout } from '@/hooks/useLeaveCheckout';
import { ApiError } from '@/lib/api';
import { hoursLabel, parseEquipment, parseSlots } from '@/lib/checkout';
import { errorHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { createBooking, getBookingGroup, previewBooking } from '@/services/bookings';
import { getPaymentByGroup, initiatePayment, listPaymentMethods } from '@/services/payments';
import { checkoutKey, useCheckout } from '@/store/checkout';
import type { PayMethodInfo } from '@/types';

// Payment, from arena-hub-player-app-booking-payment.html (frames 2 to 4 and 8).
// Four ways, in this order, nothing chosen to begin with. Card and the two
// wallets are listed but cannot be chosen yet (the server says so). The booking
// is made when Pay is tapped, not before; a second tap while it is working is
// ignored, so only one request goes out.
const SUBTITLE: Record<PayMethodInfo['key'], string> = {
  stripe: 'Debit or credit',
  manual: 'Upload your receipt',
  jazzcash: 'Mobile wallet',
  easypaisa: 'Mobile wallet',
};
const TAG: Record<string, string> = { unavailable: 'Not available yet', coming_soon: 'Coming soon' };
// shown if the list cannot be loaded: only bank transfer works
const FALLBACK: PayMethodInfo[] = [
  { key: 'stripe', method: 'card', label: 'Card', state: 'unavailable', message: null },
  { key: 'manual', method: 'bank_transfer', label: 'Bank transfer', state: 'available', message: null },
  { key: 'jazzcash', method: 'jazzcash', label: 'JazzCash', state: 'coming_soon', message: null },
  { key: 'easypaisa', method: 'easypaisa', label: 'EasyPaisa', state: 'coming_soon', message: null },
];

function MethodIcon({ k, on }: { k: PayMethodInfo['key']; on: boolean }) {
  const color = on ? Colors.light.limeDeep : Colors.light.text2;
  return k === 'stripe' ? <CardIcon color={color} /> : k === 'manual' ? <BankIcon color={color} /> : <PhoneIcon color={color} />;
}

function MethodRow({ m, on, onPress }: { m: PayMethodInfo; on: boolean; onPress: () => void }) {
  const off = m.state !== 'available';
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      disabled={off}
      accessibilityRole="radio"
      accessibilityLabel={`${m.label}, ${off ? TAG[m.state] : SUBTITLE[m.key]}`}
      accessibilityState={{ checked: on, disabled: off }}
      style={[styles.method, on && styles.methodOn, off && styles.methodOff]}>
      <IconTile tone={on ? 'lime' : undefined}>
        <MethodIcon k={m.key} on={on} />
      </IconTile>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.methodName}>{m.label}</Text>
        <Text style={styles.muted}>{SUBTITLE[m.key]}</Text>
      </View>
      {off ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{TAG[m.state]}</Text>
        </View>
      ) : (
        <View style={[styles.radio, on && { borderColor: Colors.light.limeDeep }]}>{on ? <View style={styles.radioDot} /> : null}</View>
      )}
    </Pressable>
  );
}

export default function PaymentScreen() {
  const { courtId, arenaId, slots: slotsParam, equipment: equipParam, groupId: resumeId } = useLocalSearchParams<{ courtId: string; arenaId: string; slots?: string; equipment?: string; groupId?: string }>();
  // "Pay now" on an unpaid booking opens this screen for the same booking (no second booking is made)
  const resume = !!resumeId;
  const slots = useMemo(() => parseSlots(slotsParam), [slotsParam]);
  const picked = useMemo(() => parseEquipment(equipParam), [equipParam]);
  const equipmentList = useMemo(
    () => Object.entries(picked).filter(([, q]) => q > 0).map(([equipment_id, quantity]) => ({ equipment_id, quantity })),
    [picked],
  );
  const slotIds = slots.map((s) => s.id);
  const key = checkoutKey(courtId, slotIds);
  const qc = useQueryClient();

  const remembered = useCheckout((s) => s.group);
  const remember = useCheckout((s) => s.remember);
  const groupId = resume ? resumeId : remembered?.key === key ? remembered.groupId : undefined;
  // leaving a resumed payment just goes back: the booking is not given up
  const { back, sheet } = useLeaveCheckout(resume ? undefined : groupId, arenaId);
  const resumed = useQuery({ queryKey: ['booking-group', resumeId], queryFn: () => getBookingGroup(resumeId as string), enabled: resume, retry: 1 });

  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: listPaymentMethods, retry: 1 });
  const list = methods.data ?? (methods.isError ? FALLBACK : []);
  const [method, setMethod] = useState<PayMethodInfo | null>(null);

  // the promo code: what is typed, what the server accepted, and why one was refused
  const [input, setInput] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const preview = useQuery({
    queryKey: ['booking-preview', courtId, slotIds.join(','), JSON.stringify(equipmentList), applied],
    queryFn: () => previewBooking({ court_id: courtId, slot_ids: slotIds, equipment: equipmentList, discount_code: applied ?? undefined }),
    enabled: !resume && slots.length > 0 && !!courtId && !groupId,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const rg = resumed.data;
  const p = resume
    ? rg
      ? { slots_subtotal: rg.total, equipment_total: '0', discount_amount: '0', total: rg.total, payment_type: rg.payment_type, pay_now: rg.pay_now, due_at_arena: rg.due_at_arena, discount_status: 'none' as const, discount_message: null, cancellation_note: rg.cancellation_note }
      : undefined
    : preview.data;
  const slotCount = resume ? (rg?.slot_count ?? 1) : slots.length;

  const slotLost = (start?: string) =>
    router.replace({
      pathname: '/booking/slot-lost',
      params: { courtId, arenaId, date: slots[0]?.date ?? '', start: start ?? slots[0]?.start_time ?? '', end: slots[slots.length - 1]?.end_time ?? '' },
    });
  useEffect(() => {
    if (!resume && preview.error instanceof ApiError && preview.error.status === 409) slotLost();
  }, [preview.error]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    const code = input.trim().toUpperCase();
    if (!code || checking) return;
    setChecking(true);
    setRefused(null);
    try {
      const res = await previewBooking({ court_id: courtId, slot_ids: slotIds, equipment: equipmentList, discount_code: code });
      if (res.discount_status === 'applied') {
        setApplied(code);
        setInput(code);
        qc.setQueryData(['booking-preview', courtId, slotIds.join(','), JSON.stringify(equipmentList), code], res);
      } else {
        setApplied(null);
        setRefused(res.discount_message ?? 'That code is not valid or has expired.');
        errorHaptic();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) slotLost();
      else showToast('Could not check the code. Please try again.');
    } finally {
      setChecking(false);
    }
  }
  function removeCode() {
    setApplied(null);
    setRefused(null);
    setInput('');
  }

  // Pay: make the booking (once), start the bank-transfer payment, open its screen. A ref blocks a second tap at once.
  const paying = useRef(false);
  const [busy, setBusy] = useState(false);
  async function pay() {
    if (paying.current || !method || !p) return;
    paying.current = true;
    setBusy(true);
    let gid = groupId;
    try {
      if (!gid) {
        const made = await createBooking({
          court_id: courtId,
          slot_ids: slotIds,
          payment_type: p.payment_type,
          discount_code: applied ?? undefined,
          equipment: equipmentList,
        });
        gid = made.booking_group_id;
        remember(key, gid);
      }
      let paymentId: string;
      try {
        paymentId = (await initiatePayment(gid, method.method)).payment.id;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) paymentId = (await getPaymentByGroup(gid)).id;
        else throw e;
      }
      router.push({ pathname: '/booking/bank/[groupId]', params: { groupId: gid, paymentId, arenaId } });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (!gid && status === 409) {
        slotLost();
      } else if (!gid && status === 422) {
        setApplied(null);
        setRefused(e instanceof ApiError ? e.message : 'That code is not valid or has expired.');
        errorHaptic();
      } else if (gid) {
        router.push({ pathname: '/booking/failed/[groupId]', params: { groupId: gid, arenaId, courtId } });
      } else {
        errorHaptic();
        showToast(e instanceof ApiError && status === 503 ? e.message : 'Something went wrong. Please try again.');
      }
    } finally {
      paying.current = false;
      setBusy(false);
    }
  }

  const loadingTop = methods.isLoading;
  const showTotals = p != null;
  const advance = p != null && p.payment_type === 'advance';
  const payLabel = !method ? 'Choose how to pay' : p ? `Pay ${formatRs(p.pay_now)}` : 'Pay';
  const codeState = applied ? 'ok' : refused ? 'bad' : 'idle';

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead
        title="Payment"
        onBack={back}
        right={<SecureBadge />}
      />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pad}>
        <Eyebrow top={0}>How you will pay</Eyebrow>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {loadingTop
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={58} radius={15} />)
            : list.map((m) => <MethodRow key={m.key} m={m} on={method?.key === m.key} onPress={() => setMethod(m)} />)}
        </View>

        {resume ? null : <Eyebrow top={18}>Promo code</Eyebrow>}
        {resume ? null : (
        <View style={styles.codeRow}>
          <View style={[styles.codeBox, codeState === 'bad' && { borderColor: Colors.light.red }, codeState === 'ok' && { borderColor: Colors.light.limeDeep }]}>
            <TextInput
              value={input}
              onChangeText={(t) => {
                setInput(t);
                if (refused) setRefused(null);
              }}
              editable={!applied}
              placeholder="Enter a code"
              placeholderTextColor={Colors.light.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={apply}
              accessibilityLabel="Promo code"
              style={styles.codeInput}
            />
            {applied ? <Icon name="tick" size={16} color={Colors.light.limeDeep} strokeWidth={2.4} /> : null}
          </View>
          <View style={{ width: 96 }}>
            <Button
              title={applied ? 'Remove' : 'Apply'}
              variant="ghost"
              loading={checking}
              disabled={!applied && !input.trim()}
              onPress={applied ? removeCode : apply}
            />
          </View>
        </View>
        )}
        {applied && p ? (
          <Text style={[styles.codeNote, { color: Colors.light.limeDeep }]} accessibilityLiveRegion="polite">
            {applied} applied. You save {formatRs(p.discount_amount)}.
          </Text>
        ) : refused ? (
          <Text style={[styles.codeNote, { color: Colors.light.red }]} accessibilityLiveRegion="polite">
            {refused}
          </Text>
        ) : null}

        {showTotals ? (
          <Card style={styles.totals}>
            <Line label={`Slots (${hoursLabel(slotCount)})`} value={formatRs(p.slots_subtotal)} />
            {Number(p.equipment_total) > 0 ? <Line label="Extras" value={formatRs(p.equipment_total)} /> : null}
            {applied && Number(p.discount_amount) > 0 ? <Line label={`Promo ${applied}`} value={`− ${formatRs(p.discount_amount)}`} tone="lime" /> : null}
            {advance ? <Line label="Total" value={formatRs(p.total)} /> : null}
            <Line label="Pay now" value={formatRs(p.pay_now)} bold />
            {advance ? <Line label="Pay at the arena" value={formatRs(p.due_at_arena)} /> : null}
          </Card>
        ) : (resume ? resumed.isLoading : preview.isLoading || preview.isFetching) ? (
          <View style={{ marginTop: 16 }}>
            <Skeleton height={92} radius={15} />
          </View>
        ) : (resume ? resumed.isError : preview.isError && !(preview.error instanceof ApiError && preview.error.status === 409)) ? (
          <View style={styles.retry}>
            <Text style={styles.muted}>Could not load the price.</Text>
            <View style={{ width: 160, marginTop: 10 }}>
              <Button title="Try again" onPress={() => (resume ? resumed.refetch() : preview.refetch())} />
            </View>
          </View>
        ) : null}

        <Text style={styles.agree}>By paying you agree to the arena cancellation policy.</Text>
      </ScrollView>

      <StickyBar>
        <Button title={payLabel} loading={busy} disabled={!method || !p} onPress={pay} />
      </StickyBar>
      {sheet}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 20 },
  method: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, minHeight: 58, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 15 },
  methodOn: { borderColor: Colors.light.limeDeep, backgroundColor: Colors.light.limeWash },
  methodOff: { opacity: 0.6 },
  methodName: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  muted: { fontSize: 14, color: Colors.light.muted },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: Colors.light.lineSoft },
  tagText: { fontSize: 14, fontWeight: '600', color: Colors.light.text2 },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 2, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.light.limeDeep },
  codeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  codeBox: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, borderRadius: 12 },
  codeInput: { flex: 1, minHeight: 44, fontSize: 14, color: Colors.light.text, padding: 0 },
  codeNote: { fontSize: 14, lineHeight: 20, marginTop: 7 },
  totals: { padding: 12, marginTop: 16 },
  retry: { alignItems: 'center', marginTop: 20 },
  agree: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 12 },
});
