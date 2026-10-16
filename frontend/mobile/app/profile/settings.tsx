import { router, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupLabel, MenuCard, MenuRow, Switch } from '@/components/g6/profile-ui';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { IconExtra } from '@/components/ui/icon-extra';
import { Icon } from '@/components/ui/icon';
import { ScreenHead } from '@/components/ui/screen-head';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { deleteAccount, updateProfile } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// Settings, from arena-hub-player-app-account.html (frames 10 and 11). The four switches are real stored preferences:
// notification_preferences = { push: { booking, reminder, payment, match }, email: { … } } (a missing key means on), and the
// switch sets push and email for its category together. Account notices (a suspension, say) have no switch and always go
// out. Delete account is a red sheet; the server refuses while there is an upcoming or unpaid booking and says so.
const SWITCHES = [
  { key: 'booking', title: 'Booking updates', sub: 'Confirmed, cancelled, moved' },
  { key: 'reminder', title: 'Reminders', sub: 'One day and one hour before' },
  { key: 'payment', title: 'Payments and refunds' },
  { key: 'match', title: 'Matches', sub: 'Joins, leaves, cancellations' },
] as const;
type Category = (typeof SWITCHES)[number]['key'];

type Channel = Record<string, boolean>;
const channelOf = (prefs: Record<string, unknown> | undefined, name: 'push' | 'email'): Channel => ((prefs?.[name] as Channel | undefined) ?? {});

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);
  const saving = useRef<Set<Category>>(new Set());
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const isOn = (cat: Category) => channelOf(user?.notification_preferences, 'push')[cat] !== false;

  async function toggle(cat: Category, value: boolean) {
    if (!user || saving.current.has(cat)) return;
    saving.current.add(cat);
    const before = user;
    const prefs = {
      ...(user.notification_preferences ?? {}),
      push: { ...channelOf(user.notification_preferences, 'push'), [cat]: value },
      email: { ...channelOf(user.notification_preferences, 'email'), [cat]: value },
    };
    setUser({ ...user, notification_preferences: prefs }); // at once; put back if the server says no
    try {
      setUser(await updateProfile({ notification_preferences: prefs }));
    } catch {
      setUser(before);
      showToast('Could not save that. Please try again.');
    } finally {
      saving.current.delete(cat);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteAccount();
      clear();
      setSheet(false);
      router.replace({ pathname: '/(auth)/login', params: { notice: 'Your account was deleted.' } } as unknown as Href);
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : 'Could not delete your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['bottom']}>
      <ScreenHead title="Settings" />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <GroupLabel>Notifications</GroupLabel>
        <MenuCard>
          {SWITCHES.map((s, i) => (
            <View key={s.key} style={[styles.swRow, i < SWITCHES.length - 1 && styles.swLine]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.swTitle}>{s.title}</Text>
                {'sub' in s ? <Text style={styles.swSub}>{s.sub}</Text> : null}
              </View>
              <Switch value={isOn(s.key)} onChange={(v) => toggle(s.key, v)} label={s.title} />
            </View>
          ))}
        </MenuCard>
        <Text style={styles.hint}>Push messages need your phone to allow notifications.</Text>

        <GroupLabel>Account</GroupLabel>
        <MenuCard>
          <MenuRow icon={<Icon name="lock" size={18} color={Colors.light.text2} />} title="Change password" onPress={() => router.push('/profile/change-password' as unknown as Href)} />
          <MenuRow
            icon={<IconExtra name="trash" color={Colors.light.destructive} />}
            title="Delete account"
            tone="off"
            onPress={() => {
              setRefusal(null);
              setSheet(true);
            }}
            last
          />
        </MenuCard>
      </ScrollView>

      <ConfirmSheet
        visible={sheet}
        title="Delete your account?"
        message={refusal ?? 'Your profile and sign-in will be removed. Upcoming bookings should be cancelled first. This cannot be undone.'}
        confirmLabel="Yes, delete my account"
        loading={busy}
        stacked
        onConfirm={doDelete}
        onCancel={() => !busy && setSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 28 },
  swRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  swLine: { borderBottomWidth: 1, borderBottomColor: Colors.light.lineSoft },
  swTitle: { fontSize: 14, fontWeight: '700', color: Colors.light.text },
  swSub: { fontSize: 14, color: Colors.light.muted, marginTop: 1 },
  hint: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, marginTop: 8 },
});
