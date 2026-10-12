import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigTitle, ListCard, LoadError, Nothing, Pill, SkeletonCards } from '@/components/admin/kit';
import { Segmented } from '@/components/ui/segmented';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { formatDayShort, karachiDate, karachiToday, formatDayTime, dayDiff } from '@/lib/karachi';
import { listAdminComplaints } from '@/services/admin';

// Complaints (arena-hub-admin-app.html: Complaints list, empty, loading): open ones first, with who wrote and when.
type Tab = 'open' | 'replied' | 'all';

/** "Today, 4:10 PM", "Yesterday", or "Sun 11 Oct". */
export function complaintWhen(at: string): string {
  const diff = dayDiff(karachiDate(at), karachiToday());
  if (diff <= 0) return `Today, ${formatDayTime(at).split(', ')[1]}`;
  if (diff === 1) return 'Yesterday';
  return formatDayShort(karachiDate(at));
}

export default function ComplaintsScreen() {
  const [tab, setTab] = useState<Tab>('open');
  const q = useQuery({
    queryKey: [ADMIN_KEY, 'complaints', tab],
    queryFn: () => listAdminComplaints(tab === 'open' ? 'open' : tab === 'replied' ? 'resolved' : undefined),
    retry: 1,
  });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);
  const items = q.data?.items ?? [];
  return (
    <SafeAreaView style={styles.page} edges={[]}>
      <BigTitle title="Complaints" />
      <View style={styles.seg}>
        <Segmented<Tab>
          options={[
            { value: 'open', label: 'Open' },
            { value: 'replied', label: 'Replied' },
            { value: 'all', label: 'All' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards />
        ) : q.isError && !q.data ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <Nothing title={tab === 'open' ? 'No open complaints.' : 'No complaints here.'} text={tab === 'open' ? 'Every complaint has a reply.' : 'Complaints will show here.'} />
        ) : (
          items.map((c) => (
            <ListCard
              key={c.id}
              title={c.player_name}
              sub={c.description}
              right={<Pill label={c.admin_response ? 'Replied' : 'No reply'} tone={c.admin_response ? 'ok' : 'wait'} />}
              extra={<Text style={styles.when}>{complaintWhen(c.created_at)}</Text>}
              onPress={() => router.push({ pathname: '/admin/complaints/[id]', params: { id: c.id } } as unknown as Href)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  seg: { paddingHorizontal: 18, paddingBottom: 10 },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  when: { fontSize: 14, color: Colors.light.muted, marginTop: 6 },
});
