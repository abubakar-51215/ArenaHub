import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, KV, LoadError, Pill, ReasonSheet, SkeletonCards } from '@/components/admin/kit';
import { ArenaImage } from '@/components/ui/arena-image';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { ScreenHead } from '@/components/ui/screen-head';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY, actionFailed } from '@/hooks/useAdmin';
import { successHaptic } from '@/lib/haptics';
import { formatDayTime } from '@/lib/karachi';
import { getArenaSummary, reactivateArena, suspendArena } from '@/services/admin';

// One arena (arena-hub-admin-app.html: Arena detail live and suspended, Suspend sheet, Reactivate sheet, toast).
// The Suspend sheet shows the real number of upcoming bookings that will be cancelled with a full refund (from the server).
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/arenas' as Href));

export default function AdminArenaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [ADMIN_KEY, 'arena', id], queryFn: () => getArenaSummary(id), retry: 1 });
  const a = q.data;
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
    qc.invalidateQueries({ queryKey: [ADMIN_KEY] });
  };
  const suspend = useMutation({ mutationFn: (reason: string) => suspendArena(id, reason), onSuccess: () => done(`${a?.name ?? 'Arena'} suspended.`), onError: failed });
  const lift = useMutation({ mutationFn: () => reactivateArena(id), onSuccess: () => done(`${a?.name ?? 'Arena'} is live again.`), onError: failed });

  const suspended = !!a?.suspended_at;
  const canSuspend = a?.status === 'approved' && !suspended;
  const n = a?.upcoming_bookings ?? 0;
  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title={a?.name ?? 'Arena'} onBack={back} />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        {q.isLoading ? (
          <SkeletonCards count={2} />
        ) : q.isError && !a ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : a ? (
          <>
            <ArenaImage photo={a.images[0]} sport={a.sports_offered[0]} style={styles.photo} />
            <Text variant="archivo" style={styles.title}>
              {a.name}
            </Text>
            <View style={{ marginBottom: 12 }}>
              <Pill label={suspended ? 'Suspended' : a.status === 'approved' ? 'Live' : a.status === 'pending' ? 'Waiting for approval' : 'Rejected'} tone={suspended ? 'off' : a.status === 'approved' ? 'ok' : a.status === 'pending' ? 'wait' : 'off'} />
            </View>
            {suspended ? (
              <Card style={styles.why}>
                <Text style={styles.whyHead}>Why it is suspended</Text>
                <Text style={styles.body}>{a.suspended_reason}</Text>
                {a.suspended_at ? <Text style={styles.when}>{formatDayTime(a.suspended_at)}</Text> : null}
              </Card>
            ) : null}
            <Card>
              <KV k="Owner" v={a.owner_name} />
              <KV k="City" v={a.city} />
              <KV k="Courts" v={String(a.courts)} />
              <KV k="Upcoming bookings" v={String(n)} />
              <KV k="Rating" v={a.avg_rating != null ? `${a.avg_rating.toFixed(1)} (${a.review_count})` : 'No reviews yet'} />
            </Card>
          </>
        ) : null}
      </ScrollView>
      {a && (canSuspend || suspended) ? (
        <StickyBar>
          {suspended ? <Button title="Reactivate arena" offlineLabel="Reactivate needs a connection" onPress={() => setSheet('reactivate')} /> : <Button title="Suspend arena" variant="dangerOutline" onPress={() => setSheet('suspend')} />}
        </StickyBar>
      ) : null}

      <ReasonSheet
        visible={sheet === 'suspend'}
        title={`Suspend ${a?.name ?? 'this arena'}?`}
        message={`Players cannot find or book it. ${n} upcoming ${n === 1 ? 'booking' : 'bookings'} will be cancelled with a full refund. The owner and the players are told.`}
        placeholder="Tell the owner why."
        confirmLabel="Yes, suspend arena"
        offlineLabel="Suspend needs a connection"
        loading={suspend.isPending}
        onConfirm={(r) => suspend.mutate(r)}
        onClose={() => setSheet(null)}
      />
      <ConfirmSheet
        visible={sheet === 'reactivate'}
        title={`Reactivate ${a?.name ?? 'this arena'}?`}
        message="Players can find and book it again. The owner will get a message. Cancelled bookings stay cancelled."
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
  photo: { height: 120, borderRadius: 15, overflow: 'hidden', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 22, color: Colors.light.text },
  why: { borderColor: Colors.light.destructive, backgroundColor: Colors.light.redWash, marginBottom: 12 },
  whyHead: { fontSize: 14, fontWeight: '700', marginBottom: 2, color: Colors.light.text },
  when: { fontSize: 14, color: Colors.light.muted, marginTop: 6 },
});
