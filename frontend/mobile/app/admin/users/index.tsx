import { useQuery } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListCard, LoadError, Nothing, Pill, SearchBox, SkeletonCards } from '@/components/admin/kit';
import { ScreenHead } from '@/components/ui/screen-head';
import { Segmented } from '@/components/ui/segmented';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY } from '@/hooks/useAdmin';
import { listAdminUsers } from '@/services/admin';

// Users (arena-hub-admin-app.html: Users list, Users empty): search by name, email or phone; players and owners.
type Tab = 'all' | 'player' | 'owner';
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/more' as Href));

export default function AdminUsersScreen() {
  const [tab, setTab] = useState<Tab>('all');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const q = useQuery({ queryKey: [ADMIN_KEY, 'users', tab, search], queryFn: () => listAdminUsers(tab === 'all' ? undefined : tab, search), retry: 1 });
  const items = (q.data?.items ?? []).filter((u) => u.role !== 'admin');
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Users" onBack={back} />
      <View style={styles.pad}>
        <SearchBox value={text} onChange={setText} placeholder="Search by name, email or phone" label="Search users" />
        <View style={{ height: 10 }} />
        <Segmented<Tab>
          options={[
            { value: 'all', label: 'All' },
            { value: 'player', label: 'Players' },
            { value: 'owner', label: 'Owners' },
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
          <Nothing search title="No users found." text="Try another name, email or phone." />
        ) : (
          items.map((u) => (
            <ListCard
              key={u.id}
              title={u.full_name}
              sub={`${u.email} · ${u.role === 'owner' ? 'Owner' : 'Player'}`}
              right={<Pill label={u.is_active ? 'Active' : 'Suspended'} tone={u.is_active ? 'ok' : 'off'} />}
              onPress={() => router.push({ pathname: '/admin/users/[id]', params: { id: u.id } } as unknown as Href)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 10 },
  list: { paddingHorizontal: 18, paddingBottom: 24 },
});
