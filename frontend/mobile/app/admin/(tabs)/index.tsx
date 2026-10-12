import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AIcon, BigTitle, Card, Eyebrow, LoadError, MenuRow, Nothing, SkeletonCards } from '@/components/admin/kit';
import { CountBadge } from '@/components/ui/count-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { useAdminUnread, useOverview } from '@/hooks/useAdmin';
import { tapHaptic } from '@/lib/haptics';
import { formatDayShort, karachiToday, timeAgo } from '@/lib/karachi';
import { formatRs } from '@/lib/money';

// Overview (arena-hub-admin-app.html: Overview, loading, all clear, error): four numbers and what needs the admin.
const go = (href: string) => router.push(href as unknown as Href);

function Kpi({ n, label, color }: { n: number; label: string; color?: string }) {
  return (
    <Card style={styles.kpi}>
      <Text variant="archivo" style={[styles.kpiN, color ? { color } : null]}>
        {n}
      </Text>
      <Text style={styles.kpiL}>{label}</Text>
    </Card>
  );
}

export default function OverviewScreen() {
  const q = useOverview();
  const unread = useAdminUnread();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([q.refetch(), unread.refetch()]);
    setRefreshing(false);
  }, [q, unread]);
  const d = q.data;
  const today = karachiToday();
  const day = formatDayShort(today);
  const clear = !!d && d.pending_arenas === 0 && d.open_complaints === 0 && d.refunds_waiting === 0;

  return (
    <SafeAreaView style={styles.page} edges={[]}>
      <BigTitle
        title="Overview"
        right={
          <Pressable
            onPress={() => {
              tapHaptic();
              go('/admin/notifications');
            }}
            accessibilityRole="button"
            accessibilityLabel={unread.data ? `Notifications, ${unread.data} unread` : 'Notifications'}
            style={styles.bell}>
            <AIcon name="bell" size={21} />
            <CountBadge count={unread.data ?? 0} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <>
            <View style={styles.grid}>
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} style={styles.kpi}>
                  <Skeleton width="40%" height={30} radius={8} />
                  <View style={{ height: 8 }} />
                  <Skeleton width="70%" height={14} radius={7} />
                </Card>
              ))}
            </View>
            <SkeletonCards count={2} />
          </>
        ) : q.isError && !d ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : d ? (
          <>
            <Text style={styles.today}>Today · {day}</Text>
            <View style={styles.grid}>
              <Kpi n={d.pending_arenas} label="Arenas waiting" color={d.pending_arenas ? Colors.light.amber : undefined} />
              <Kpi n={d.open_complaints} label="Open complaints" color={d.open_complaints ? Colors.light.destructive : undefined} />
              <Kpi n={d.bookings_today} label="Bookings today" />
              <Kpi n={d.refunds_waiting} label="Refunds waiting" />
            </View>
            {clear ? (
              <Nothing title="All clear." text="Nothing is waiting for you right now." />
            ) : (
              <>
                <Eyebrow>Needs you</Eyebrow>
                {d.pending_arenas > 0 ? (
                  <Card style={styles.need}>
                    <MenuRow
                      icon="approvals"
                      tone="wait"
                      last
                      title={`${d.pending_arenas} ${d.pending_arenas === 1 ? 'arena' : 'arenas'} waiting for approval`}
                      sub={d.oldest_pending_arena_name && d.oldest_pending_arena_at ? `Oldest: ${d.oldest_pending_arena_name}, ${timeAgo(d.oldest_pending_arena_at)}` : undefined}
                      onPress={() => go('/admin/approvals')}
                    />
                  </Card>
                ) : null}
                {d.open_complaints > 0 ? (
                  <Card style={styles.need}>
                    <MenuRow
                      icon="complaints"
                      tone="off"
                      last
                      title={`${d.open_complaints} ${d.open_complaints === 1 ? 'complaint' : 'complaints'} without a reply`}
                      sub={d.oldest_open_complaint_at ? `Oldest: ${timeAgo(d.oldest_open_complaint_at)}` : undefined}
                      onPress={() => go('/admin/complaints')}
                    />
                  </Card>
                ) : null}
                {d.refunds_waiting > 0 ? (
                  <Card style={styles.need}>
                    <MenuRow
                      icon="pay"
                      tone="wait"
                      last
                      title={`${d.refunds_waiting} ${d.refunds_waiting === 1 ? 'refund' : 'refunds'} waiting to be paid`}
                      sub={`${formatRs(d.refunds_waiting_amount)} in total`}
                      onPress={() => go('/admin/payments?tab=refunds')}
                    />
                  </Card>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  today: { fontSize: 14, color: Colors.light.muted, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  kpi: { width: '48%', flexGrow: 1, padding: 14 },
  kpiN: { fontSize: 30, fontWeight: '700', lineHeight: 34, color: Colors.light.text },
  kpiL: { fontSize: 14, color: Colors.light.muted, marginTop: 6 },
  need: { paddingVertical: 4, paddingHorizontal: 14, marginBottom: 10 },
  bell: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.light.card, borderWidth: 1, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
});
