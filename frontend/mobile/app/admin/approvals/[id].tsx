import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HANDLED } from '@/components/admin/arena-text';
import { Card, Eyebrow, KV, LoadError, Pill, ReasonSheet, SkeletonCards } from '@/components/admin/kit';
import { ArenaImage } from '@/components/ui/arena-image';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { ScreenHead } from '@/components/ui/screen-head';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { sportLabel } from '@/constants/sports';
import { ADMIN_KEY, actionFailed } from '@/hooks/useAdmin';
import { successHaptic } from '@/lib/haptics';
import { formatDayTime } from '@/lib/karachi';
import { formatRs } from '@/lib/money';
import { approveArena, getArenaSummary, rejectArena } from '@/services/admin';

// An arena waiting for approval (arena-hub-admin-app.html: Approval detail, Approve sheet, Reject sheet, toasts).
const back = () => (router.canGoBack() ? router.back() : router.replace('/admin/approvals' as Href));

export default function ApprovalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [ADMIN_KEY, 'arena', id], queryFn: () => getArenaSummary(id), retry: 1 });
  const [sheet, setSheet] = useState<'approve' | 'reject' | null>(null);
  const a = q.data;

  const done = (message: string) => {
    successHaptic();
    setSheet(null);
    showToast(message);
    qc.invalidateQueries({ queryKey: [ADMIN_KEY] });
    back();
  };
  const failed = (err: unknown) => {
    setSheet(null);
    if (actionFailed(err, 'Could not save. Please try again.', HANDLED) === 'handled') {
      qc.invalidateQueries({ queryKey: [ADMIN_KEY] });
      back();
    }
  };
  const approve = useMutation({ mutationFn: () => approveArena(id), onSuccess: () => done(`${a?.name ?? 'Arena'} approved.`), onError: failed });
  const reject = useMutation({ mutationFn: (reason: string) => rejectArena(id, reason), onSuccess: () => done(`${a?.name ?? 'Arena'} rejected.`), onError: failed });

  const waiting = a?.status === 'pending';
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
              <Pill label={waiting ? 'Waiting for approval' : a.status === 'approved' ? 'Approved' : 'Rejected'} tone={waiting ? 'wait' : a.status === 'approved' ? 'ok' : 'off'} />
            </View>
            {a.status === 'rejected' && a.rejection_reason ? (
              <Card style={styles.reason}>
                <Text style={styles.reasonHead}>Why it was rejected</Text>
                <Text style={styles.body}>{a.rejection_reason}</Text>
              </Card>
            ) : null}
            <Card>
              <KV k="Owner" v={a.owner_name} />
              <KV k="Owner email" v={a.owner_email} />
              <KV k="Address" v={a.address} />
              <KV k="City" v={a.city} />
              <KV k="Sports" v={a.sports_offered.map(sportLabel).join(', ') || 'None yet'} />
              <KV k="Courts" v={String(a.courts)} />
              {a.min_price ? <KV k="From" v={`${formatRs(a.min_price)} / hour`} /> : null}
              <KV k="Asked on" v={formatDayTime(a.created_at)} />
            </Card>
            {a.description ? (
              <View style={{ marginTop: 16 }}>
                <Eyebrow>About</Eyebrow>
                <Text style={styles.body}>{a.description}</Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      {waiting ? (
        <StickyBar>
          <Button title="Approve arena" offlineLabel="Approve needs a connection" onPress={() => setSheet('approve')} />
          <Button title="Reject arena" variant="dangerOutline" onPress={() => setSheet('reject')} />
        </StickyBar>
      ) : null}

      <ConfirmSheet
        visible={sheet === 'approve'}
        title={`Approve ${a?.name ?? 'this arena'}?`}
        message="Players will be able to find and book it. The owner will get a message."
        confirmLabel="Yes, approve"
        cancelLabel="Not yet"
        destructive={false}
        stacked
        loading={approve.isPending}
        offlineLabel="Approve needs a connection"
        onConfirm={() => approve.mutate()}
        onCancel={() => setSheet(null)}
      />
      <ReasonSheet
        visible={sheet === 'reject'}
        title={`Reject ${a?.name ?? 'this arena'}?`}
        message="The owner will see your reason and can fix it and ask again."
        placeholder="Tell the owner what to fix."
        confirmLabel="Yes, reject arena"
        offlineLabel="Reject needs a connection"
        loading={reject.isPending}
        onConfirm={(r) => reject.mutate(r)}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  photo: { height: 140, borderRadius: 15, overflow: 'hidden', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: Colors.light.text, marginBottom: 4 },
  body: { fontSize: 15, lineHeight: 22, color: Colors.light.text },
  reason: { borderColor: Colors.light.destructive, backgroundColor: Colors.light.redWash, marginBottom: 12 },
  reasonHead: { fontSize: 14, fontWeight: '700', marginBottom: 2, color: Colors.light.text },
});
