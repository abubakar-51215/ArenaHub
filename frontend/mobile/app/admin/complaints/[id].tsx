import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Eyebrow, KV, LoadError, Pill, SkeletonCards } from '@/components/admin/kit';
import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { KeyboardScroll } from '@/components/ui/keyboard-scroll';
import { ScreenHead } from '@/components/ui/screen-head';
import { StickyBar } from '@/components/ui/sticky-bar';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { categoryLabel } from '@/lib/complaints-ui';
import { Colors } from '@/constants/theme';
import { ADMIN_KEY, actionFailed } from '@/hooks/useAdmin';
import { successHaptic } from '@/lib/haptics';
import { formatDayTime } from '@/lib/karachi';
import { getAdminComplaint, replyToComplaint } from '@/services/admin';

// One complaint (arena-hub-admin-app.html: Complaint detail, reply typed, replied, reply sent toast, leave sheet).
// The frames also show a booking and an arena; a complaint does not carry them on the server, so they are not shown.
const MAX = 2000;
const exit = () => (router.canGoBack() ? router.back() : router.replace('/admin/complaints' as Href));

export default function AdminComplaintScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [ADMIN_KEY, 'complaint', id], queryFn: () => getAdminComplaint(id), retry: 1 });
  const c = q.data;
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const replied = !!c?.admin_response && !editing;
  const dirty = text.trim().length > 0 && !replied;

  // leaving with text typed asks first (the screen's back button and the Android back button)
  const tryLeave = () => (dirty ? setLeaving(true) : exit());
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dirty) {
        setLeaving(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dirty]);

  const send = useMutation({
    mutationFn: () => replyToComplaint(id, text.trim()),
    onSuccess: (updated) => {
      successHaptic();
      showToast('Reply sent. The player has been told.');
      qc.setQueryData([ADMIN_KEY, 'complaint', id], updated);
      qc.invalidateQueries({ queryKey: [ADMIN_KEY, 'complaints'] });
      qc.invalidateQueries({ queryKey: [ADMIN_KEY, 'overview'] });
      setEditing(false);
      setText('');
    },
    onError: (err) => {
      actionFailed(err, 'Could not send. Please try again.');
    },
  });

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Complaint" onBack={tryLeave} />
      <KeyboardScroll
        contentContainerStyle={styles.pad}
        footer={
          c ? (
            <StickyBar>
              {replied ? (
                <Button
                  title="Edit reply"
                  variant="ghost"
                  onPress={() => {
                    setText(c.admin_response ?? '');
                    setEditing(true);
                  }}
                />
              ) : (
                <Button title={editing ? 'Save reply' : 'Send reply'} offlineLabel="Send needs a connection" disabled={text.trim().length === 0} loading={send.isPending} onPress={() => send.mutate()} />
              )}
            </StickyBar>
          ) : undefined
        }>
        {q.isLoading ? (
          <SkeletonCards count={2} />
        ) : q.isError && !c ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : c ? (
          <>
            <View style={{ marginBottom: 10 }}>
              <Pill label={c.admin_response ? 'Replied' : 'No reply'} tone={c.admin_response ? 'ok' : 'wait'} />
            </View>
            <Card style={{ marginBottom: 12 }}>
              <KV k="Player" v={c.player_name} />
              <KV k="Sent" v={formatDayTime(c.created_at)} />
              <KV k="Category" v={categoryLabel(c.category as never)} />
            </Card>
            <Eyebrow>Their message</Eyebrow>
            <Card style={styles.message}>
              <Text style={styles.body}>{c.description}</Text>
            </Card>
            {replied ? (
              <>
                <Eyebrow>Your reply</Eyebrow>
                <Card style={styles.reply}>
                  <Text style={styles.body}>{c.admin_response}</Text>
                  {c.updated_at ? <Text style={styles.sent}>Sent {formatDayTime(c.updated_at)}</Text> : null}
                </Card>
              </>
            ) : (
              <>
                <TextField
                  kind="multiline"
                  label="Your reply"
                  placeholder="Write a reply. The player gets a message."
                  value={text}
                  onChangeText={(t) => setText(t.slice(0, MAX))}
                  maxLength={MAX}
                  accessibilityLabel="Your reply"
                />
                <Text style={styles.counter}>
                  {text.length} / {MAX}
                </Text>
              </>
            )}
          </>
        ) : null}
      </KeyboardScroll>

      <ConfirmSheet
        visible={leaving}
        title="Leave without sending?"
        message="Your reply will not be saved."
        confirmLabel="Yes, leave"
        cancelLabel="Stay"
        stacked
        onConfirm={() => {
          setLeaving(false);
          exit();
        }}
        onCancel={() => setLeaving(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  message: { padding: 14, marginBottom: 14 },
  reply: { padding: 14, backgroundColor: Colors.light.limeWash, borderColor: Colors.light.limeDeep },
  body: { fontSize: 15, lineHeight: 22, color: Colors.light.text },
  sent: { fontSize: 14, color: Colors.light.muted, marginTop: 8 },
  counter: { fontSize: 14, color: Colors.light.muted, textAlign: 'right', marginTop: 4 },
});
