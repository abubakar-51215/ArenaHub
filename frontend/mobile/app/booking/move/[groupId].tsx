import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, Line, Note } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { useCourtSlots } from '@/hooks/useCourtSlots';
import { ApiError } from '@/lib/api';
import { compactRange, hoursLabel, shortDate } from '@/lib/checkout';
import { toLocalDateString } from '@/lib/dates';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { groupSlots, hidePast, hourLabel } from '@/lib/slots';
import { getBookingGroup, previewReschedule, rescheduleBookingGroup } from '@/services/bookings';
import type { TimeSlot } from '@/types';

// Reschedule and Confirm move, from arena-hub-player-app-bookings.html. The same court and the same length;
// the server prices the move (reschedule-preview) and does it (reschedule). A dearer time leaves the extra
// to pay at the arena (no online balance payment while the gateways are not live); a cheaper one is refunded.
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function nextDays(n: number) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({ iso: toLocalDateString(d), weekday: WEEKDAY[d.getDay()], num: d.getDate(), long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) });
  }
  return out;
}

export default function MoveBookingScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const qc = useQueryClient();
  const group = useQuery({ queryKey: ['booking-group', groupId], queryFn: () => getBookingGroup(groupId), retry: 1 });
  const g = group.data;
  const days = useMemo(() => nextDays(7), []);
  const [date, setDate] = useState(days[0].iso);
  const [startId, setStartId] = useState<string | null>(null);
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const slotsQ = useCourtSlots(g?.court_id, date);

  const n = g?.slot_count ?? 1;
  const own = useMemo(() => new Set(g?.slot_ids ?? []), [g]);
  const visible = useMemo(() => hidePast(slotsQ.data ?? [], days[0].iso).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)), [slotsQ.data, days]);
  // a start time works if n times in a row from it are free (the booking's own times count as free)
  const runFor = (i: number): TimeSlot[] | null => {
    const run = visible.slice(i, i + n);
    if (run.length < n) return null;
    for (let k = 0; k < n; k++) {
      if (run[k].status !== 'available' && !own.has(run[k].id)) return null;
      if (k > 0 && run[k - 1].end_time.slice(0, 5) !== run[k].start_time.slice(0, 5)) return null;
    }
    if (run.every((s) => own.has(s.id)) && own.size === n) return null; // that is the time it already has
    return run;
  };
  const runs = useMemo(() => new Map(visible.map((s, i) => [s.id, runFor(i)])), [visible, n, own]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => groupSlots(visible, 0), [visible]);
  const chosen = startId ? runs.get(startId) ?? null : null;
  const newIds = chosen?.map((s) => s.id) ?? [];

  const preview = useQuery({
    queryKey: ['move-preview', groupId, newIds.join(',')],
    queryFn: () => previewReschedule(groupId, newIds),
    enabled: newIds.length > 0,
    retry: false,
  });
  const pv = preview.data;
  const previewError = preview.error instanceof ApiError ? preview.error.message : preview.isError ? 'Could not price this move.' : null;

  const move = useMutation({
    mutationFn: () => rescheduleBookingGroup(groupId, newIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking-groups'] });
      qc.invalidateQueries({ queryKey: ['booking-group', groupId] });
      successHaptic();
      showToast('Booking moved.');
      router.dismissTo({ pathname: '/booking/detail/[groupId]', params: { groupId } });
    },
    onError: (e) => {
      errorHaptic();
      showToast(e instanceof ApiError && e.message ? e.message : 'Could not move the booking. Please try again.');
      setStep('pick');
      setStartId(null);
      slotsQ.refetch();
    },
  });

  const diffText = !pv ? '—' : Number(pv.balance) > 0 ? `+ ${formatRs(pv.balance)}` : Number(pv.refund) > 0 ? `− ${formatRs(pv.refund)}` : 'No change';
  const newLabel = chosen ? `${shortDate(date)} · ${compactRange(chosen[0].start_time, chosen[chosen.length - 1].end_time)}` : '';

  if (g && !g.can_reschedule) {
    return (
      <SafeAreaView style={styles.page} edges={['bottom']}>
        <ScreenHead title="Move your booking" />
        <View style={styles.pad}>
          <Note>This booking can no longer be moved. Moving is only possible before the free cancellation time.</Note>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Move your booking" onBack={step === 'confirm' ? () => setStep('pick') : undefined} />
      {!g ? (
        <View style={styles.pad}>
          <Skeleton height={70} radius={11} />
          <View style={{ height: 14 }} />
          <Skeleton height={56} radius={12} />
        </View>
      ) : step === 'pick' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Note>{`You can move this booking once. Pick a new day and time at ${g.court_name}. Same length: ${hoursLabel(n)}.`}</Note>
          <Eyebrow>Day</Eyebrow>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {days.map((d) => {
              const on = d.iso === date;
              return (
                <PressableScale
                  key={d.iso}
                  onPress={() => {
                    setDate(d.iso);
                    setStartId(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={d.long}
                  accessibilityState={{ selected: on }}>
                  <View style={[styles.day, on && styles.dayOn]}>
                    <Text style={[styles.dayName, on && { color: Colors.light.paper }]}>{d.weekday}</Text>
                    <Text style={[styles.dayNum, on && { color: Colors.light.paper }]}>{d.num}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>

          {slotsQ.isLoading ? (
            <View style={styles.grid}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.cell}>
                  <Skeleton height={44} radius={11} />
                </View>
              ))}
            </View>
          ) : slotsQ.isError ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.muted}>Could not load the times.</Text>
              <View style={{ width: 160, marginTop: 10 }}>
                <Button title="Try again" onPress={() => slotsQ.refetch()} />
              </View>
            </View>
          ) : visible.length === 0 ? (
            <Text style={[styles.muted, { marginTop: 16 }]}>No times have been published for this day.</Text>
          ) : (
            groups.map((grp) => (
              <View key={grp.key}>
                <Eyebrow>{grp.label}</Eyebrow>
                <View style={styles.grid}>
                  {grp.slots.map((s) => {
                    const ok = !!runs.get(s.id);
                    const on = s.id === startId;
                    return (
                      <View key={s.id} style={styles.cell}>
                        <Pressable
                          onPress={ok ? () => setStartId(s.id) : undefined}
                          disabled={!ok}
                          accessibilityRole="button"
                          accessibilityLabel={`${hourLabel(s.start_time)}${ok ? '' : ', not available'}${on ? ', selected' : ''}`}
                          accessibilityState={{ disabled: !ok, selected: on }}
                          style={[styles.slot, on && styles.slotOn, !ok && styles.slotOff]}>
                          <Text style={[styles.slotText, !ok && { color: Colors.light.muted, textDecorationLine: 'line-through' }]}>{hourLabel(s.start_time)}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          <Card style={styles.sum}>
            <Line label="Now" value={`${shortDate(g.booking_date)} · ${compactRange(g.start_time, g.end_time)}`} />
            <Line label="New" value={chosen ? newLabel : '—'} />
            <Line label="Price difference" value={preview.isFetching && newIds.length ? '…' : diffText} />
          </Card>
          {previewError ? <Text style={styles.err}>{previewError}</Text> : null}
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
          <Card style={styles.sum0}>
            <Line label="From" value={`${shortDate(g.booking_date)} · ${compactRange(g.start_time, g.end_time)}`} />
            <Line label="To" value={newLabel} />
            <Line label="Court" value={g.court_name} />
          </Card>
          <Eyebrow>Price</Eyebrow>
          <Card style={styles.sum0}>
            <Line label="New slots" value={pv ? formatRs(pv.new_total) : '—'} />
            <Line label="Already paid" value={pv ? `− ${formatRs(pv.paid)}` : '—'} />
            {pv && Number(pv.refund) > 0 ? (
              <Line label="Refund to you" value={formatRs(pv.refund)} bold />
            ) : pv && Number(pv.balance) > 0 ? (
              <Line label="To pay at the arena" value={formatRs(pv.balance)} bold />
            ) : (
              <Line label="Nothing more to pay" value={formatRs(0)} bold />
            )}
          </Card>
          <View style={{ marginTop: 12 }}>
            <Note>This is your one move. After this you can still cancel, but you cannot move it again.</Note>
          </View>
        </ScrollView>
      )}

      {g ? (
        <StickyBar>
          {step === 'pick' ? (
            <Button title="Review change" disabled={!chosen || !pv || !!previewError} onPress={() => setStep('confirm')} />
          ) : (
            <>
              <Button title="Move booking" loading={move.isPending} onPress={() => !move.isPending && move.mutate()} />
              <Button title="Back" variant="ghost" onPress={() => setStep('pick')} />
            </>
          )}
        </StickyBar>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 20 },
  muted: { fontSize: 14, color: Colors.light.muted },
  strip: { gap: 7, paddingRight: 4 },
  day: { width: 56, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  dayName: { fontSize: 14, color: Colors.light.text },
  dayNum: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { width: '31.5%' },
  slot: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  slotOn: { backgroundColor: Colors.light.lime, borderColor: Colors.light.limeDeep },
  slotOff: { backgroundColor: Colors.light.lineSoft },
  slotText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  sum: { padding: 12, marginTop: 16 },
  sum0: { padding: 12 },
  err: { fontSize: 14, lineHeight: 20, color: Colors.light.red, marginTop: 8 },
});
