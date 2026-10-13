import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconExtra } from '@/components/ui/icon-extra';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { tapHaptic } from '@/lib/haptics';
import { dayGroup, shortAgo } from '@/lib/karachi';
import { noticeLook, noticeTarget, type NoticeIcon, type NoticeTone } from '@/lib/notification-target';
import { getBooking } from '@/services/bookings';
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/services/notifications';

// Notifications, from arena-hub-player-app-account.html (frames 01 to 04): Today / Yesterday / Earlier, a lime dot on
// what is unread, "Mark all read", and a tap opens what the notice is about (a booking, a match, the reviews screen for
// "Rate your last game", a complaint). No delete and no swipe.
const TONE: Record<NoticeTone, { bg: string; fg: string }> = {
  ok: { bg: Colors.light.limeWash, fg: Colors.light.limeText },
  wait: { bg: Colors.light.amberWash, fg: Colors.light.amberText },
  off: { bg: Colors.light.redWash, fg: Colors.light.redText },
  idle: { bg: Colors.light.lineSoft, fg: Colors.light.muted },
};

function NoticeIconView({ icon, color }: { icon: NoticeIcon; color: string }) {
  switch (icon) {
    case 'tick':
      return <Icon name="tick" size={18} color={color} strokeWidth={2.4} />;
    case 'star':
      return <Icon name="star" size={18} color={color} fill={color} />;
    case 'bell':
      return <Icon name="bell" size={18} color={color} />;
    case 'clock':
      return <IconExtra name="clock" color={color} />;
    case 'receipt':
      return <IconExtra name="receipt" color={color} />;
    case 'close':
      return <IconExtra name="close" color={color} />;
    case 'people':
      return <IconExtra name="people" color={color} />;
    case 'lifebuoy':
      return <IconExtra name="lifebuoy" color={color} />;
  }
}

type Row = { type: 'head'; key: string; label: string } | { type: 'row'; key: string; n: AppNotification };

function NoticeRow({ n, onPress }: { n: AppNotification; onPress: (n: AppNotification) => void }) {
  const look = noticeLook(n.event);
  const tone = TONE[look.tone];
  const unread = !n.read_at;
  return (
    <Pressable
      onPress={() => onPress(n)}
      accessibilityRole="button"
      accessibilityLabel={`${n.title}. ${n.body}${unread ? ' Unread.' : ''}`}
      style={styles.row}>
      <View style={[styles.tile, { backgroundColor: tone.bg }]}>
        <NoticeIconView icon={look.icon} color={tone.fg} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={2}>
          {n.title}
        </Text>
        <Text style={styles.rowText} numberOfLines={3}>
          {n.body}
        </Text>
      </View>
      <View style={styles.rowSide}>
        <Text style={styles.time}>{shortAgo(n.created_at)}</Text>
        {unread ? <View style={styles.dot} /> : <View style={styles.dotSpace} />}
      </View>
    </Pressable>
  );
}

function SkeletonRows() {
  return (
    <View style={styles.list}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width="55%" radius={7} />
            <Skeleton height={14} width="85%" radius={7} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['my-notifications'], queryFn: () => listMyNotifications(), retry: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const opening = useRef(false);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let last = '';
    for (const n of items) {
      const g = dayGroup(n.created_at);
      if (g !== last) {
        out.push({ type: 'head', key: `h-${g}`, label: g });
        last = g;
      }
      out.push({ type: 'row', key: n.id, n });
    }
    return out;
  }, [items]);

  const refreshCounts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['my-notifications'] });
    queryClient.invalidateQueries({ queryKey: ['unread-count'] });
  }, [queryClient]);

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: refreshCounts,
    onError: () => showToast('Could not mark them as read. Please try again.'),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);

  const open = useCallback(
    async (n: AppNotification) => {
      if (opening.current) return;
      opening.current = true;
      tapHaptic();
      try {
        if (!n.read_at) {
          markNotificationRead(n.id).then(refreshCounts, () => {});
        }
        const target = noticeTarget(n);
        if (target.kind === 'booking') {
          const booking = await getBooking(target.bookingId);
          router.push({ pathname: '/booking/detail/[groupId]', params: { groupId: booking.booking_group_id } } as unknown as Href);
        } else if (target.kind === 'match') {
          router.push({ pathname: '/play/[matchId]', params: { matchId: target.matchId } } as unknown as Href);
        } else if (target.kind === 'review') {
          router.push({ pathname: '/arena/[id]/reviews', params: { id: target.arenaId, bookingId: target.bookingId } } as unknown as Href);
        } else if (target.kind === 'complaint') {
          router.push({ pathname: '/support/[id]', params: { id: target.complaintId } } as unknown as Href);
        }
      } catch {
        showToast('Could not open that. Please try again.');
      } finally {
        opening.current = false;
      }
    },
    [refreshCounts],
  );

  const unread = q.data?.unread_count ?? 0;

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead
        title="Notifications"
        right={
          <Pressable
            onPress={() => !markAll.isPending && markAll.mutate()}
            disabled={!unread || markAll.isPending}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            accessibilityState={{ disabled: !unread }}
            style={styles.markAll}>
            <Text style={[styles.markAllText, !unread && { opacity: 0.35 }]}>Mark all read</Text>
          </Pressable>
        }
      />
      {q.isLoading ? (
        <SkeletonRows />
      ) : q.isError && !q.data ? (
        <ErrorState title="Could not load notifications." onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={({ item }) =>
            item.type === 'head' ? (
              <Text style={styles.head} accessibilityRole="header">
                {item.label}
              </Text>
            ) : (
              <NoticeRow n={item.n} onPress={open} />
            )
          }
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.ink} colors={[Colors.light.ink]} />}
          ListEmptyComponent={
            <EmptyState
              icon={<Icon name="bell" size={30} color={Colors.light.limeDeep} />}
              title="Nothing yet."
              text="Booking updates, reminders and refunds will show up here."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  markAll: { minHeight: 44, justifyContent: 'center' },
  markAllText: { fontSize: 14, fontWeight: '700', color: Colors.light.limeText },
  list: { paddingHorizontal: 18, paddingBottom: 24, flexGrow: 1 },
  head: { fontSize: 11, fontWeight: '600', letterSpacing: 1.1, textTransform: 'uppercase', color: Colors.light.muted, marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, minHeight: 64 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  rowTitleUnread: { fontWeight: '700' },
  rowText: { fontSize: 14, lineHeight: 20, color: Colors.light.muted },
  rowSide: { alignItems: 'flex-end', gap: 6, minWidth: 32 },
  time: { fontSize: 14, color: Colors.light.muted },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.light.limeDeep },
  dotSpace: { width: 8, height: 8 },
});
