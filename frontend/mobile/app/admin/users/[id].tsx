import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, KV, LoadError, Pill, ReasonSheet, SkeletonCards } from '@/components/admin/kit';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { ScreenHead } from '@/components/ui/screen-head';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY, actionFailed } from '@/hooks/useAdmin';
import { successHaptic } from '@/lib/haptics';
import { formatDayShort, karachiDate } from '@/lib/karachi';
import { getAdminUser, reactivateUser, suspendUser } from '@/services/admin';

// One user (arena-hub-admin-app.html: User detail, Suspend user sheet, suspended, Reactivate sheet, toast).
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/users' as Href));

export default function AdminUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [ADMIN_KEY, 'user', id], queryFn: () => getAdminUser(id), retry: 1 });
  const u = q.data;
  const [sheet, setSheet] = useState<'suspend' | 'reactivate' | null>(null);

  const done = (message: string) => {
    successHaptic();
    setSheet(null);
    showToast(message);
    qc.invalidateQueries({ queryKey: [ADMIN_KEY] });
  };
  const failed = (err: unknown) => {
    setSheet(null);
    actionFailed(err, 'Could not save. Please try again.');
  };
  const suspend = useMutation({ mutationFn: (reason: string) => suspendUser(id, reason), onSuccess: () => done(`${u?.full_name ?? 'User'} suspended.`), onError: failed });
  const lift = useMutation({ mutationFn: () => reactivateUser(id), onSuccess: () => done(`${u?.full_name ?? 'User'} is active again.`), onError: failed });

  const joined = u ? `${formatDayShort(karachiDate(u.created_at))} ${karachiDate(u.created_at).slice(0, 4)}` : '';
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title={u?.full_name ?? 'User'} onBack={back} />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards count={2} />
        ) : q.isError && !u ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : u ? (
          <>
            <View style={styles.top}>
              <View style={styles.avatar}>
                <Text variant="archivo" style={styles.avatarText}>
                  {u.full_name.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <Text variant="archivo" style={styles.name}>
                {u.full_name}
              </Text>
              <Pill label={u.is_active ? 'Active' : 'Suspended'} tone={u.is_active ? 'ok' : 'off'} />
            </View>
            {!u.is_active && u.suspended_reason ? (
              <Card style={styles.why}>
                <Text style={styles.whyHead}>Why it is suspended</Text>
                <Text style={styles.body}>{u.suspended_reason}</Text>
              </Card>
            ) : null}
            <Card>
              <KV k="Role" v={u.role === 'owner' ? 'Owner' : u.role === 'admin' ? 'Admin' : 'Player'} />
              <KV k="Email" v={u.email} />
              <KV k="Phone" v={u.phone} />
              <KV k="Joined" v={joined} />
              <KV k="Bookings" v={String(u.total_bookings)} />
              <KV k="Complaints" v={String(u.total_complaints)} />
            </Card>
          </>
        ) : null}
      </ScrollView>
      {u && u.role !== 'admin' ? (
        <StickyBar>
          {u.is_active ? <Button title="Suspend user" variant="dangerOutline" onPress={() => setSheet('suspend')} /> : <Button title="Reactivate user" offlineLabel="Reactivate needs a connection" onPress={() => setSheet('reactivate')} />}
        </StickyBar>
      ) : null}

      <ReasonSheet
        visible={sheet === 'suspend'}
        title={`Suspend ${u?.full_name ?? 'this user'}?`}
        message="They are signed out and cannot sign in. They will see your reason."
        placeholder="Tell them why."
        confirmLabel="Yes, suspend user"
        offlineLabel="Suspend needs a connection"
        loading={suspend.isPending}
        onConfirm={(r) => suspend.mutate(r)}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === 'reactivate'}
        title={`Reactivate ${u?.full_name ?? 'this user'}?`}
        message="They can sign in again. They will get a message."
        confirmLabel="Yes, reactivate"
        cancelLabel="Not yet"
        destructive={false}
        stacked
        loading={lift.isPending}
        offlineLabel="Reactivate needs a connection"
        onConfirm={() => lift.mutate()}
        onCancel={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  top: { alignItems: 'center', gap: 8, paddingTop: 6, paddingBottom: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '700', color: Colors.light.lime },
  name: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text },
  body: { fontSize: 15, lineHeight: 22, color: Colors.light.text },
  why: { borderColor: Colors.light.destructive, backgroundColor: Colors.light.redWash, marginBottom: 12 },
  whyHead: { fontSize: 14, fontWeight: '700', marginBottom: 2, color: Colors.light.text },
});
