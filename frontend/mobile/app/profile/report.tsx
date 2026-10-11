import { useQueries } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow, Line } from '@/components/booking/parts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { toLocalDateString } from '@/lib/dates';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { formatRs } from '@/lib/money';
import { listBookingGroups, type BookingTab } from '@/services/bookings';
import { fetchMyBookingsReport } from '@/services/reports';

// Booking history, from arena-hub-player-app-bookings.html (frame "History report"): a period, how many bookings
// and how much was spent in it, and a download. The file comes from GET /reports/my-bookings (PDF) and is
// handed to the system share sheet.
type Period = 'last30' | 'last3m' | 'year' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last3m', label: 'Last 3 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
];

function startOf(p: Period): string | undefined {
  const d = new Date();
  if (p === 'last30') d.setDate(d.getDate() - 30);
  else if (p === 'last3m') d.setMonth(d.getMonth() - 3);
  else if (p === 'year') return `${d.getFullYear()}-01-01`;
  else return undefined;
  return toLocalDateString(d);
}

export default function BookingHistoryScreen() {
  const [period, setPeriod] = useState<Period>('last3m');
  const [busy, setBusy] = useState(false);
  const tabs: BookingTab[] = ['upcoming', 'past', 'cancelled'];
  const qs = useQueries({ queries: tabs.map((t) => ({ queryKey: ['booking-groups', t, 'all'], queryFn: () => listBookingGroups(t, 1, 100), retry: 1 })) });
  const loading = qs.some((q) => q.isLoading);
  const failed = qs.some((q) => q.isError);

  const from = startOf(period);
  const stats = useMemo(() => {
    const items = qs.flatMap((q) => q.data?.items ?? []).filter((b) => !from || b.booking_date >= from);
    const spent = items.reduce((s, b) => s + (b.payment_status === 'completed' ? Number(b.pay_now) : 0) - Number(b.refund_amount), 0);
    return { found: items.length, spent };
  }, [qs, from]);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const { bytes, filename, mime } = await fetchMyBookingsReport({ from, format: 'pdf' });
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        file.write(bytes);
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: 'com.adobe.pdf' });
        else showToast('Sharing is not available on this device.');
      }
      successHaptic();
    } catch {
      errorHaptic();
      showToast('Could not make the report. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Booking history" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pad}>
        <Text style={styles.lead}>Download a list of your bookings with arena, court, date, time and amount.</Text>
        <Eyebrow top={14}>Period</Eyebrow>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {PERIODS.map((p) => {
            const on = p.value === period;
            return (
              <Pressable key={p.value} onPress={() => setPeriod(p.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: Colors.light.paper }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {loading ? (
          <View style={{ marginTop: 16 }}>
            <Skeleton height={84} radius={15} />
          </View>
        ) : (
          <Card style={styles.card}>
            <Line label="Bookings found" value={failed ? '—' : String(stats.found)} />
            <Line label="Total spent" value={failed ? '—' : formatRs(stats.spent)} bold />
          </Card>
        )}
        {failed && !loading ? <Text style={styles.err}>Could not count your bookings. The report can still be downloaded.</Text> : null}
      </ScrollView>
      <StickyBar>
        <Button title="Download report" loading={busy} onPress={download} />
      </StickyBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 2 },
  lead: { fontSize: 14, lineHeight: 21, color: Colors.light.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.light.line, backgroundColor: Colors.light.card, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  card: { padding: 12, marginTop: 16 },
  err: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 8 },
});
