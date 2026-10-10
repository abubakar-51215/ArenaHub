import { useQueries } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors, Font } from '@/constants/theme';
import { useArenaCourts } from '@/hooks/useArenas';
import { useCourtSlots } from '@/hooks/useCourtSlots';
import { useAvailability } from '@/hooks/useSlotsInfo';
import { toLocalDateString } from '@/lib/dates';
import { errorHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { groupSlots, hidePast, hourLabel, rangeLabel, slotKind, toggleSlot } from '@/lib/slots';
import { getAvailability } from '@/services/courts';
import type { TimeSlot } from '@/types';

// Pick a slot, from arena-hub-player-app-arena-slots.html: a 7-day strip with
// a dot per day, a court switch, the day's times in groups (Morning / Afternoon
// / Evening, "cheaper" or "peak" decided here from the court's base price),
// tap times next to each other to play longer, and a sticky bar with the range,
// the hours and the total. A slot someone else takes while you choose leaves
// your selection with a toast; one held mid-booking shows "Held" and cannot be
// tapped; times already past today are hidden.
const MAX_SLOTS_PER_BOOKING = 8; // mirrors backend MAX_SLOTS_PER_BOOKING
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function nextDays(n: number) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      iso: toLocalDateString(d),
      weekday: WEEKDAY[d.getDay()],
      num: d.getDate(),
      long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
      short: `${WEEKDAY[d.getDay()]} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`,
      dayName: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    });
  }
  return out;
}

function Pill({ slot, on, kind, onPress }: { slot: TimeSlot; on: boolean; kind: 'open' | 'cheaper' | 'peak'; onPress: () => void }) {
  const gone = slot.status === 'booked' || slot.status === 'maintenance';
  const held = slot.status === 'reserved';
  const tappable = slot.status === 'available';
  const sub = gone ? 'Taken' : held ? 'Held' : formatRs(slot.price);
  const label = `${hourLabel(slot.start_time)}, ${sub}${on ? ', selected' : ''}`;
  return (
    <PressableScale
      style={styles.pillCell}
      onPress={tappable ? onPress : undefined}
      disabled={!tappable}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !tappable, selected: on }}>
      <View
        style={[
          styles.pill,
          kind === 'cheaper' && tappable && styles.pillDeal,
          (gone || held) && styles.pillDashed,
          held && styles.pillHeld,
          on && styles.pillOn,
        ]}>
        <Text style={[styles.pillTime, (gone || held) && styles.pillTimeMuted, gone && styles.strike, on && styles.pillTimeOn]}>{hourLabel(slot.start_time)}</Text>
        <Text style={[styles.pillSub, kind === 'cheaper' && tappable && styles.pillSubDeal, on && styles.pillSubOn]}>{sub}</Text>
      </View>
    </PressableScale>
  );
}

export default function SlotSelectionScreen() {
  const { id: courtParam, arenaId } = useLocalSearchParams<{ id: string; arenaId: string }>();
  const days = useMemo(() => nextDays(7), []);
  const [courtId, setCourtId] = useState(courtParam as string);
  const [date, setDate] = useState(days[0].iso);
  const [picked, setPicked] = useState<TimeSlot[]>([]);

  const courts = useArenaCourts(arenaId);
  const court = courts.data?.find((c) => c.id === courtId);
  const base = Number(court?.base_price ?? 0);
  const slotsQuery = useCourtSlots(courtId, date);
  const avail = useAvailability(courtId, days[0].iso, days[6].iso);
  const dotFor = (iso: string) => avail.data?.find((a) => a.date === iso)?.open_count ?? 0;

  const visible = useMemo(() => hidePast(slotsQuery.data ?? [], days[0].iso), [slotsQuery.data, days]);
  const open = visible.filter((s) => s.status === 'available');
  const groups = useMemo(() => groupSlots(visible, base), [visible, base]);
  const day = days.find((d) => d.iso === date) ?? days[0];

  // the selected slots, as the live list currently shows them
  const selected = useMemo(() => picked.map((p) => visible.find((s) => s.id === p.id)).filter((s): s is TimeSlot => !!s && s.status === 'available'), [picked, visible]);

  // a slot taken by someone else while you choose: it leaves the selection, with a toast and an error haptic
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    const lost = picked.filter((p) => {
      const now = visible.find((s) => s.id === p.id);
      return now && now.status !== 'available';
    });
    if (lost.length === 0) return;
    const fresh = lost.filter((l) => !seen.current.has(l.id));
    lost.forEach((l) => seen.current.add(l.id));
    setPicked((ps) => ps.filter((p) => !lost.some((l) => l.id === p.id)));
    if (fresh.length) {
      errorHaptic();
      const remaining = picked.length - lost.length;
      showToast(`${hourLabel(fresh[0].start_time)} was just taken.${remaining > 0 ? ' Your other time is still selected.' : ''}`);
    }
  }, [visible, picked]);

  const choose = (slot: TimeSlot) => setPicked((ps) => toggleSlot(ps, slot, MAX_SLOTS_PER_BOOKING));
  const clear = () => setPicked([]);
  const total = selected.reduce((sum, s) => sum + Number(s.price), 0);

  // other days and courts with open times, for "fully booked" days
  const otherCourts = (courts.data ?? []).filter((c) => c.id !== courtId);
  const otherAvail = useQueries({
    queries: otherCourts.map((c) => ({ queryKey: ['court-availability', c.id, days[0].iso, days[6].iso], queryFn: () => getAvailability(c.id, days[0].iso, days[6].iso), staleTime: 30_000 })),
  });
  const suggestions = useMemo(() => {
    const out: { iso: string; courtId: string; courtName: string; count: number }[] = [];
    for (const d of days) {
      const here = avail.data?.find((a) => a.date === d.iso);
      if (here && here.open_count > 0 && !(d.iso === date)) out.push({ iso: d.iso, courtId, courtName: court?.name ?? '', count: here.open_count });
      otherCourts.forEach((c, i) => {
        const a = otherAvail[i]?.data?.find((x) => x.date === d.iso);
        if (a && a.open_count > 0) out.push({ iso: d.iso, courtId: c.id, courtName: c.name, count: a.open_count });
      });
    }
    return out.slice(0, 2);
  }, [days, avail.data, otherAvail, otherCourts, courtId, court?.name, date]);

  const goBooking = () =>
    router.push({
      pathname: '/booking/[courtId]',
      params: {
        courtId,
        arenaId: arenaId as string,
        slots: JSON.stringify(selected.map((s) => ({ id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, price: s.price }))),
      },
    });

  const loading = slotsQuery.isLoading;
  const failed = slotsQuery.isError;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Date & time" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        {/* the 7-day strip: a dot per day (grey and dimmed when no time is left) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {days.map((d) => {
            const on = d.iso === date;
            const count = dotFor(d.iso);
            const empty = avail.data != null && count === 0 && !on;
            return (
              <PressableScale
                key={d.iso}
                onPress={() => {
                  setDate(d.iso);
                  clear();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${d.long}${avail.data ? `, ${count} open` : ''}`}
                accessibilityState={{ selected: on }}>
                <View style={[styles.day, on && styles.dayOn, empty && { opacity: 0.55 }]}>
                  <Text style={[styles.dayName, on && styles.dayNameOn]}>{d.weekday}</Text>
                  <Text variant="archivo" style={[styles.dayNum, on && styles.dayNumOn]}>
                    {d.num}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: count === 0 ? Colors.light.line : on ? Colors.light.lime : Colors.light.limeDeep }]} />
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>

        <View style={styles.pad}>
          {(courts.data?.length ?? 0) > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seg} accessibilityRole="tablist">
              {(courts.data ?? []).map((c) => {
                const on = c.id === courtId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setCourtId(c.id);
                      clear();
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    style={[styles.segBtn, on && styles.segOn]}>
                    <Text style={[styles.segText, on && styles.segTextOn]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {failed ? (
            <View style={styles.center}>
              <View style={{ marginBottom: 10 }}>
<BrandMark mode="offline" size={72} />
</View>
              <Text variant="archivo" style={styles.stateTitle}>
                Could not load times
              </Text>
              <Text style={styles.stateText}>Check your connection and try again.</Text>
              <View style={styles.stateButton}>
                <Button title="Try again" onPress={() => slotsQuery.refetch()} />
              </View>
            </View>
          ) : loading ? (
            <View>
              <Skeleton height={16} width={140} radius={6} />
              <View style={{ height: 14 }} />
              <View style={styles.grid}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={styles.pillCell}>
                    <Skeleton height={53} radius={10} />
                  </View>
                ))}
              </View>
            </View>
          ) : visible.length === 0 || open.length === 0 ? (
            <View style={styles.center}>
              <View style={[styles.stateIcon, { backgroundColor: Colors.light.lineSoft }]}>
                <Icon name="cal" size={26} color={Colors.light.text2} />
              </View>
              <Text variant="archivo" style={styles.stateTitle}>
                {visible.length === 0 ? `No times on ${day.dayName}` : `Fully booked on ${day.dayName}`}
              </Text>
              <Text style={styles.stateText}>{visible.length === 0 ? 'No times have been published for this day. Try another day or court.' : 'Every time is taken. Try another day or court.'}</Text>
              {suggestions.map((s) => (
                <PressableScale
                  key={`${s.iso}-${s.courtId}`}
                  style={styles.suggestBox}
                  contentStyle={styles.suggest}
                  onPress={() => {
                    setCourtId(s.courtId);
                    setDate(s.iso);
                    clear();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${days.find((d) => d.iso === s.iso)?.short}, ${s.courtName}, ${s.count} open`}>
                  <Text style={styles.suggestText}>
                    <Text style={styles.bold}>{days.find((d) => d.iso === s.iso)?.short}</Text> · {s.courtName}
                  </Text>
                  <Badge status="ok" label={`${s.count} open`} />
                </PressableScale>
              ))}
            </View>
          ) : (
            <>
              <View style={styles.headRow}>
                <Text style={styles.dayLong} accessibilityRole="header">
                  {day.long}
                </Text>
                <Badge status="ok" label={`${open.length} ${open.length === 1 ? 'slot' : 'slots'} open`} />
              </View>
              {groups.map((g, gi) => (
                <View key={g.key} style={gi ? { marginTop: 14 } : undefined}>
                  <Text style={styles.eyebrow} accessibilityRole="header">
                    {g.label}
                  </Text>
                  <View style={styles.grid}>
                    {g.slots.map((s) => (
                      <Pill key={s.id} slot={s} on={selected.some((p) => p.id === s.id)} kind={slotKind(Number(s.price), base)} onPress={() => choose(s)} />
                    ))}
                  </View>
                </View>
              ))}
              <Text style={styles.hint}>Tap more times next to each other to play longer. Past times are hidden.</Text>
            </>
          )}
        </View>
      </ScrollView>

      <StickyBar>
        <View style={styles.stickyRow}>
          <Text style={[styles.muted, { flex: 1 }]} numberOfLines={2}>
            {rangeLabel(day.short, selected)}
          </Text>
          <Text style={styles.total}>{selected.length ? formatRs(total) : '—'}</Text>
        </View>
        <Button title="Continue" disabled={selected.length === 0} onPress={goBooking} />
      </StickyBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, marginTop: 14 },
  strip: { gap: 6, paddingHorizontal: 18, paddingBottom: 2 },
  day: { width: 44, minHeight: 56, paddingVertical: 8, borderRadius: 11, alignItems: 'center', borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card },
  dayOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  // the weekday is an uppercase label (exempt from the 14px rule)
  dayName: { fontSize: 9, letterSpacing: 0.72, textTransform: 'uppercase', color: Colors.light.muted },
  dayNameOn: { color: Colors.light.lime },
  dayNum: { fontSize: 16, lineHeight: 19, fontWeight: '700', color: Colors.light.text },
  dayNumOn: { color: Colors.light.paper },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  seg: { flexDirection: 'row', gap: 3, backgroundColor: Colors.light.lineSoft, borderRadius: 11, padding: 3, marginBottom: 12, alignSelf: 'flex-start' },
  segBtn: { minHeight: 44, minWidth: 96, paddingHorizontal: 14, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: Colors.light.card },
  segText: { fontSize: 14, fontWeight: '600', color: Colors.light.muted },
  segTextOn: { color: Colors.light.text },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  dayLong: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  // uppercase labels are exempt from the 14px rule
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pillCell: { width: '31.6%' },
  pill: { paddingVertical: 9, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card, alignItems: 'center', minHeight: 53 },
  pillDeal: { borderColor: Colors.light.limeDeep, backgroundColor: Colors.light.limeWash },
  pillDashed: { borderStyle: 'dashed', backgroundColor: Colors.light.slotOpen },
  pillHeld: { backgroundColor: Colors.light.slotOpen },
  pillOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink, borderStyle: 'solid' },
  pillTime: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  pillTimeMuted: { color: Colors.light.muted },
  strike: { textDecorationLine: 'line-through' },
  pillTimeOn: { color: Colors.light.paper },
  // the price under the time is a small label (12px)
  pillSub: { fontSize: 12, fontWeight: '500', color: Colors.light.muted, marginTop: 2 },
  pillSubDeal: { color: Colors.light.limeDeep },
  pillSubOn: { color: Colors.light.lime },
  hint: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 14 },
  center: { alignItems: 'center', paddingTop: 34 },
  stateIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  stateText: { fontSize: 14, lineHeight: 21, color: Colors.light.muted, marginTop: 6, marginBottom: 16, textAlign: 'center' },
  stateButton: { width: 200 },
  suggestBox: { alignSelf: 'stretch', backgroundColor: Colors.light.card, borderColor: Colors.light.line, borderWidth: 1, borderRadius: 15, marginTop: 8 },
  suggest: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, padding: 12 },
  suggestText: { fontSize: 14, color: Colors.light.text },
  bold: { fontWeight: '700' },
  muted: { fontSize: 14, color: Colors.light.muted },
  stickyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  total: { fontFamily: Font.bodyBold, fontSize: 14, color: Colors.light.text },
});
