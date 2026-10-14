import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadError, ListCard, Nothing, Pill, SearchBox, ShowMore, SkeletonCards } from '@/components/admin/kit';
import { ScreenHead } from '@/components/ui/screen-head';
import { Segmented } from '@/components/ui/segmented';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { useAdminPages } from '@/hooks/useAdminPages';
import { listArenaCards, type ArenaScope } from '@/services/admin';

// Arenas (arena-hub-admin-app.html: Arenas list, Arenas suspended, Arenas empty): find an arena to suspend or bring back.
type Tab = 'live' | 'suspended' | 'all';
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/more' as Href));

export default function AdminArenasScreen() {
  const [tab, setTab] = useState<Tab>('live');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const { q, items, total } = useAdminPages([ADMIN_KEY, 'arenas', tab, search], (page) => listArenaCards(tab as ArenaScope, search, page));
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Arenas" onBack={back} />
      <View style={styles.pad}>
        <SearchBox value={text} onChange={setText} placeholder="Search arenas" label="Search arenas" />
        <View style={{ height: 10 }} />
        <Segmented<Tab>
          options={[
            { value: 'live', label: 'Live' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'all', label: 'All' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards />
        ) : q.isError && !q.data ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <Nothing search title="No arenas found." text="Try another name." />
        ) : (
          items.map((a) => (
            <ListCard
              key={a.id}
              title={a.name}
              sub={`${a.city}${a.area ? `, ${a.area}` : ''} · ${a.owner_name}`}
              right={a.is_suspended ? <Pill label="Suspended" tone="off" /> : a.status === 'approved' ? <Pill label="Live" tone="ok" /> : <Pill label={a.status === 'pending' ? 'Waiting' : 'Rejected'} tone={a.status === 'pending' ? 'wait' : 'off'} />}
              onPress={() => router.push({ pathname: '/admin/arenas/[id]', params: { id: a.id } } as unknown as Href)}
            />
          ))
        )}
        <ShowMore shown={items.length} total={total} hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onMore={() => void q.fetchNextPage()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 10 },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
});
