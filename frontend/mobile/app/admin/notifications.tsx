import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Eyebrow, LoadError, MenuRow, Nothing, ShowMore, SkeletonCards, type AdminIconName, type PillTone } from '@/components/admin/kit';
import { ScreenHead } from '@/components/ui/screen-head';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { useAdminPages } from '@/hooks/useAdminPages';
import { Colors } from '@/constants/theme';
import { dayGroup } from '@/lib/karachi';
import { adminNoticeTarget } from '@/lib/notification-target';
import { listMyNotificationsPage, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/services/notifications';

// Admin notifications (arena-hub-admin-app.html: Admin notifications): a new arena waiting, a new complaint.
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/more' as Href));

function look(n: AppNotification): { icon: AdminIconName; tone: PillTone; href: string | null } {
  const target = adminNoticeTarget(n);
  if (n.event === 'arena_waiting') return { icon: 'approvals', tone: 'wait', href: target.kind === 'approval' ? `/admin/approvals/${target.arenaId}` : '/admin/approvals' };
  if (n.event === 'complaint_new') return { icon: 'complaints', tone: 'off', href: target.kind === 'complaint' ? `/admin/complaints/${target.complaintId}` : '/admin/complaints' };
  return { icon: 'bell', tone: 'idle', href: null };
}

export default function AdminNotificationsScreen() {
  const qc = useQueryClient();
  const { q, pages, items, total } = useAdminPages([ADMIN_KEY, 'notifications'], (page) => listMyNotificationsPage(page));
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_KEY, 'unread'] }),
  });
  // opening the list reads everything (the dot on the Overview bell goes)
  const unread = pages[0]?.unread_count ?? 0;
  useEffect(() => {
    if (unread > 0) readAll.mutate();
  }, [unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = (['Today', 'Yesterday', 'Earlier'] as const).map((g) => ({ g, rows: items.filter((n) => dayGroup(n.created_at) === g) })).filter((x) => x.rows.length > 0);
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Notifications" onBack={back} />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards />
        ) : q.isError && !q.data ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <Nothing title="Nothing new." text="New arenas and complaints will show here." />
        ) : (
          groups.map(({ g, rows }) => (
            <View key={g} style={{ marginBottom: 16 }}>
              <Eyebrow>{g}</Eyebrow>
              <Card style={styles.group}>
                {rows.map((n, i) => {
                  const l = look(n);
                  return (
                    <MenuRow
                      key={n.id}
                      icon={l.icon}
                      tone={l.tone}
                      title={n.title}
                      sub={n.body}
                      last={i === rows.length - 1}
                      onPress={() => {
                        if (!n.read_at) markNotificationRead(n.id).catch(() => {});
                        if (l.href) router.push(l.href as unknown as Href);
                      }}
                    />
                  );
                })}
              </Card>
            </View>
          ))
        )}
        <ShowMore shown={items.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => void q.fetchNextPage()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
});
