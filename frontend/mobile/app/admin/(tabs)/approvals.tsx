import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { arenaSub } from '@/components/admin/arena-text';
import { BigTitle, ListCard, LoadError, Nothing, Pill, SkeletonCards } from '@/components/admin/kit';
import { Segmented } from '@/components/ui/segmented';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { waitingFor } from '@/lib/karachi';
import { listArenaCards, type ArenaScope } from '@/services/admin';

// Approvals (arena-hub-admin-app.html: Approvals list, empty, loading, error): arenas by what the admin decided.
type Tab = 'waiting' | 'approved' | 'rejected';

export default function ApprovalsScreen() {
  const [tab, setTab] = useState<Tab>('waiting');
  const q = useQuery({ queryKey: [ADMIN_KEY, 'arenas', tab], queryFn: () => listArenaCards(tab as ArenaScope), retry: 1 });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await q.refetch();
    setRefreshing(false);
  }, [q]);
  const items = q.data?.items ?? [];
  return (
    <SafeAreaView style={styles.page} edges={[]}>
      <BigTitle title="Approvals" />
      <View style={styles.seg}>
        <Segmented<Tab>
          options={[
            { value: 'waiting', label: 'Waiting' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
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
          <Nothing
            title={tab === 'waiting' ? 'Nothing is waiting.' : `No ${tab} arenas.`}
            text={tab === 'waiting' ? 'New arenas will show here when an owner asks to be listed.' : 'Arenas you decided on will show here.'}
          />
        ) : (
          items.map((a) => (
            <ListCard
              key={a.id}
              title={a.name}
              sub={arenaSub(a)}
              right={tab === 'waiting' ? <Pill label={waitingFor(a.created_at)} tone="wait" /> : <Pill label={tab === 'approved' ? 'Approved' : 'Rejected'} tone={tab === 'approved' ? 'ok' : 'off'} />}
              onPress={() => router.push({ pathname: '/admin/approvals/[id]', params: { id: a.id } } as unknown as Href)}
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
});
