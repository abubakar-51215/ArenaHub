import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, Line, Note, StatusPill } from '@/components/booking/parts';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { CourtArt } from '@/components/ui/court-art';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { sportLabel } from '@/constants/sports';
import { Colors } from '@/constants/theme';
import { useArenaCourts, useArenaRating } from '@/hooks/useArenas';
import { statusPill } from '@/lib/bookings-ui';
import { ApiError } from '@/lib/api';
import { dayAndMonth, hoursLabel, longDate, timeRange } from '@/lib/checkout';
import { errorHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { cancelBookingGroup, getBookingGroup, getCancelPreview } from '@/services/bookings';

// Booking detail, Cancel booking (sheet), Cancel late (same sheet, the server's numbers), Cannot move and
// Cancelled detail, from arena-hub-player-app-bookings.html. The server says what is allowed
// (can_cancel, can_reschedule) and what a cancel would refund (cancel-preview).
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', card: 'Card', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };
const REFUND_STATE: Record<string, string> = { pending: 'Pending', processed: 'Refunded', failed: 'Needs help' };

export default function BookingDetailScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const qc = useQueryClient();
  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId), retry: 1 });
  const g = group.data;
  const courts = useArenaCourts(g?.arena_id);
  const rating = useArenaRating(g?.arena_id);
  const court = courts.data?.find((c) => c.id === g?.court_id);

  const [sheet, setSheet] = useState(false);
  const preview = useQuery({ queryKey: ['cancel-preview', groupId], queryFn: () => getCancelPreview(groupId), enabled: sheet, retry: 1, staleTime: 0 });
  const cancel = useMutation({
    mutationFn: () => cancelBookingGroup(groupId),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['booking-groups'] });
      qc.invalidateQueries({ queryKey: ['booking-group', groupId] });
      setSheet(false);
      showToast(Number(d.refund_amount) > 0 ? 'Booking cancelled. Refund on its way.' : 'Booking cancelled.');
      router.replace({ pathname: '/(tabs)/bookings', params: { tab: 'cancelled' } });
    },
    onError: (e) => {
      errorHaptic();
      showToast(e instanceof ApiError && e.message ? e.message : 'Could not cancel. Please try again.');
      qc.invalidateQueries({ queryKey: ['booking-group', groupId] });
      setSheet(false);
    },
  });

  const cancelled = g && (g.status === 'cancelled' || g.status === 'rejected');
  const live = g && (g.status === 'confirmed' || g.status === 'pending_payment' || g.status === 'pending_approval');
  const unpaid = g?.status === 'pending_payment';
  const startPast = g ? new Date(`${g.booking_date}T${g.start_time}`) <= new Date() : false;
  // an unpaid booking whose time has passed, or one the server let go after 24 hours, can no longer be paid
  const released = !!g && ((unpaid && startPast) || (!!cancelled && g.status === 'cancelled' && /^Auto-cancelled/.test(g.cancellation_reason ?? '')));
  const rejected = g?.status === 'rejected';
  const ownerReason = rejected && g?.cancellation_reason ? g.cancellation_reason : null;
  const active = !!live && !released;
  const refundPending = !!g && live && Number(g.refund_amount) > 0 && g.refund_status !== 'processed';
  const pill = g ? statusPill(g.status) : null;
  const paid = g && g.payment_status === 'completed' ? g.pay_now : '0';
  const p = preview.data;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Booking" />
      {group.isError && !g ? (
        <View style={styles.center}>
          <View style={{ marginBottom: 14 }}>
            <BrandMark mode="offline" size={74} />
          </View>
          <Text variant="archivo" style={styles.stateTitle}>
            Could not load your booking
          </Text>
          <Text style={styles.stateText}>Check your connection and try again.</Text>
          <View style={{ width: 200 }}>
            <Button title="Try again" onPress={() => group.refetch()} />
          </View>
        </View>
      ) : !g ? (
        <View style={styles.pad}>
          <Skeleton height={110} radius={15} />
          <View style={{ height: 11 }} />
          <Skeleton height={72} radius={15} />
          <View style={{ height: 11 }} />
          <Skeleton height={150} radius={15} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Card style={styles.codeCard}>
            <Text style={styles.mute}>Booking code</Text>
            <Text variant="archivo" style={styles.code}>
              {g.booking_code}
            </Text>
            {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
          </Card>

          <Card style={styles.arena}>
            <View style={styles.art}>
              <CourtArt sport={court?.sport_types[0]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {g.arena_name}
              </Text>
              <Text style={styles.mute} numberOfLines={1}>
                {[g.arena_address.split(',')[0], rating.data?.average_rating ? `${Number(rating.data.average_rating).toFixed(1)} ★` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Card>

          <Card style={styles.info}>
            <Line label="Sport" value={court?.sport_types[0] ? sportLabel(court.sport_types[0]) : '—'} />
            <Line label="Date" value={longDate(g.booking_date)} />
            <Line label="Time" value={`${timeRange(g.start_time, g.end_time)} · ${hoursLabel(g.slot_count)}`} />
            <Line label="Court" value={g.court_name} />
            {court?.capacity ? <Line label="Players" value={`Up to ${court.capacity}`} /> : null}
          </Card>

          <Eyebrow>Payment</Eyebrow>
          <Card style={styles.info2}>
            <Line label={`Slots (${hoursLabel(g.slot_count)})`} value={formatRs(g.total)} />
            <Line label="Paid with" value={unpaid ? 'Not paid yet' : g.payment_method ? (METHOD[g.payment_method] ?? '—') : '—'} />
            <Line label="Total paid" value={formatRs(paid)} bold />
            {active && Number(g.due_at_arena) > 0 ? <Line label="Pay at the arena" value={formatRs(g.due_at_arena)} /> : null}
          </Card>

          {refundPending && g ? (
            <Text style={styles.refundNote}>{`Your ${formatRs(g.refund_amount)} refund is pending. The arena sends it to your bank.`}</Text>
          ) : null}

          {released ? (
            <View style={[styles.greyNote, { marginTop: 12 }]}>
              <Text style={styles.greyNoteText}>This booking was released because it was not paid in time.</Text>
            </View>
          ) : rejected ? (
            <>
              <Eyebrow>Receipt</Eyebrow>
              <Card style={styles.info2}>
                <Text style={styles.receiptText}>The arena could not match your receipt.</Text>
                {ownerReason ? <Text style={styles.reasonText}>{ownerReason}</Text> : null}
              </Card>
              <Text style={styles.refundNote}>No money comes back for this booking.</Text>
            </>
          ) : cancelled && g ? (
            <>
              <Eyebrow>Refund</Eyebrow>
              <Card style={styles.info2}>
                <Line label="Refund amount" value={formatRs(g.refund_amount)} />
                <Line
                  label="Status"
                  value={<StatusPill label={Number(g.refund_amount) > 0 ? (REFUND_STATE[g.refund_status ?? 'pending'] ?? 'Pending') : 'No refund'} tone={g.refund_status === 'processed' ? 'ok' : Number(g.refund_amount) > 0 ? 'wait' : 'idle'} />}
                />
              </Card>
              <Text style={styles.refundNote}>
                {Number(g.refund_amount) <= 0
                  ? 'No money comes back for this booking.'
                  : g.refund_status === 'processed'
                    ? 'Your refund was sent to your bank.'
                    : 'The arena sends your refund to your bank. We will tell you here when it is done.'}
              </Text>
            </>
          ) : active && g ? (
            <View style={{ marginTop: 12 }}>
              {unpaid ? (
                <View style={styles.greyNote}>
                  <Text style={styles.greyNoteText}>Pay first. After that you can move or cancel this booking.</Text>
                </View>
              ) : g.can_reschedule ? (
                <Note>{`${g.cancellation_note} You can move this booking once, before that time.`}</Note>
              ) : (
                <View style={styles.greyNote}>
                  <Text style={styles.greyNoteText}>This booking can no longer be moved. Moving is only possible before the free cancellation time.</Text>
                </View>
              )}
            </View>
          ) : null}
          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {g && active ? (
        <StickyBar>
          {unpaid ? (
            <Button title="Pay now" onPress={() => router.push({ pathname: '/booking/payment', params: { groupId, arenaId: g.arena_id, courtId: g.court_id } })} />
          ) : g.can_reschedule ? (
            <Button title="Reschedule" variant="ghost" onPress={() => router.push({ pathname: '/booking/move/[groupId]', params: { groupId } })} />
          ) : (
            <Button title="Reschedule not available" variant="off" disabled />
          )}
          {g.can_cancel ? <Button title="Cancel booking" variant="dangerOutline" onPress={() => setSheet(true)} /> : null}
        </StickyBar>
      ) : g ? (
        <StickyBar>
          <Button title="Book again" variant="ghost" onPress={() => router.push({ pathname: '/arena/[id]', params: { id: g.arena_id } })} />
        </StickyBar>
      ) : null}

      <ConfirmSheet
        visible={sheet}
        stacked
        title="Cancel this booking?"
        message={
          p && Number(p.paid) > 0 && p.refund_percentage < 100 && !p.receipt_waiting
            ? 'Free cancellation time has passed.'
            : g
              ? `${dayAndMonth(g.booking_date).replace(', ', ' ')}, ${timeRange(g.start_time, g.end_time)} at ${g.arena_name}.`
              : ''
        }
        confirmLabel="Yes, cancel booking"
        cancelLabel="Stay"
        loading={cancel.isPending}
        confirmDisabled={!p}
        onConfirm={() => cancel.mutate()}
        onCancel={() => !cancel.isPending && setSheet(false)}>
        {preview.isError ? (
          <Text style={styles.sheetError}>Could not check the refund. Close this and try again.</Text>
        ) : p ? (
          <>
            <Card style={styles.sheetCard}>
              <Line label="You paid" value={formatRs(p.paid)} />
              <Line label="Kept by arena" value={formatRs(Number(p.paid) - Number(p.refund_amount))} />
              <Line label="You get back" value={formatRs(p.refund_amount)} bold />
            </Card>
            {p.receipt_waiting ? (
              <Text style={styles.sheetNote}>Your receipt is with the arena. If your money arrived, the arena will send it back after checking.</Text>
            ) : Number(p.paid) > 0 && p.refund_percentage >= 100 ? (
              <Text style={styles.sheetNote}>Free cancellation applies. The refund goes back to your bank within a few working days.</Text>
            ) : Number(p.paid) <= 0 ? (
              <Text style={styles.sheetNote}>No money has been taken for this booking, so there is nothing to refund.</Text>
            ) : null}
          </>
        ) : (
          <View style={{ marginTop: 12 }}>
            <Skeleton height={96} radius={15} />
          </View>
        )}
      </ConfirmSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2 },
  codeCard: { padding: 14, alignItems: 'center', gap: 2 },
  code: { fontSize: 24, fontWeight: '700', letterSpacing: 1.4, color: Colors.light.text, marginBottom: 8 },
  mute: { fontSize: 14, color: Colors.light.muted },
  arena: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, marginTop: 11 },
  art: { width: 60, height: 52, borderRadius: 10, overflow: 'hidden' },
  name: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  info: { padding: 12, marginTop: 11 },
  info2: { padding: 12 },
  greyNote: { padding: 12, borderRadius: 11, backgroundColor: Colors.light.lineSoft, borderWidth: 1, borderColor: Colors.light.line },
  greyNoteText: { fontSize: 14, lineHeight: 20, color: Colors.light.text2 },
  receiptText: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: Colors.light.text },
  reasonText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 6 },
  refundNote: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 10 },
  center: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 18 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 16, textAlign: 'center' },
  sheetCard: { padding: 12, marginTop: 12 },
  sheetNote: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 14 },
  sheetError: { fontSize: 14, lineHeight: 20, color: Colors.light.red, marginTop: 12 },
});
