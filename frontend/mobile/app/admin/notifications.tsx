import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Eyebrow, LoadError, MenuRow, Nothing, SkeletonCards, type AdminIconName, type PillTone } from '@/components/admin/kit';
import { ScreenHead } from '@/components/ui/screen-head';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { Colors } from '@/constants/theme';
import { dayGroup } from '@/lib/karachi';
import { listMyNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/services/notifications';

// Admin notifications (arena-hub-admin-app.html: Admin notifications): a new arena waiting, a new complaint.
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/more' as Href));

function look(n: AppNotification): { icon: AdminIconName; tone: PillTone; href: string | null } {
  const d = n.data ?? {};
  if (n.event === 'arena_waiting') return { icon: 'approvals', tone: 'wait', href: typeof d.arena_id === 'string' ? `/admin/approvals/${d.arena_id}` : '/admin/approvals' };
  if (n.event === 'complaint_new') return { icon: 'complaints', tone: 'off', href: typeof d.complaint_id === 'string' ? `/admin/complaints/${d.complaint_id}` : '/admin/complaints' };
  return { icon: 'bell', tone: 'idle', href: null };
}

export default function AdminNotificationsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [ADMIN_KEY, 'notifications'], queryFn: listMyNotifications, retry: 1 });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: [ADMIN_KEY, 'unread'] }),
  });
  // opening the list reads everything (the dot on the Overview bell goes)
  useEffect(() => {
    if (q.data && q.data.unread_count > 0) readAll.mutate();
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = q.data?.items ?? [];
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 24 },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
});
