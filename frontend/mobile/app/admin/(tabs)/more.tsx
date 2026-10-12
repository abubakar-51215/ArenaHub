import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigTitle, Card, MenuRow } from '@/components/admin/kit';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { logout } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// More (arena-hub-admin-app.html: More, Log out sheet): the other admin lists, and Log out.
const go = (href: string) => router.push(href as unknown as Href);

export default function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setBusy(true);
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // the phone's own sign-in is cleared whatever the server says
    } finally {
      useAuthStore.getState().clear(); // also empties everything cached for the admin
      router.replace('/(auth)/login' as Href);
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={[]}>
      <BigTitle title="More" />
      <ScrollView contentContainerStyle={styles.pad} showsVerticalScrollIndicator={false}>
        <Card style={styles.who}>
          <View style={styles.avatar}>
            <Text variant="archivo" style={styles.avatarText}>
              {(user?.full_name ?? 'A').trim().charAt(0).toUpperCase() || 'A'}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              Platform admin
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </Card>
        <Card style={styles.group}>
          <MenuRow icon="arena" title="Arenas" sub="Suspend or bring back an arena" onPress={() => go('/admin/arenas')} />
          <MenuRow icon="user" title="Users" sub="Search, suspend or bring back" onPress={() => go('/admin/users')} />
          <MenuRow icon="pay" title="Payments and refunds" sub="Money in and refunds waiting" onPress={() => go('/admin/payments')} />
          <MenuRow icon="bell" title="Notifications" sub="New arenas and complaints" last onPress={() => go('/admin/notifications')} />
        </Card>
        <Card style={[styles.group, { marginTop: 14 }]}>
          <MenuRow icon="logout" tone="off" title="Log out" last onPress={() => setAsking(true)} right={<View />} />
        </Card>
      </ScrollView>
      <ConfirmSheet
        visible={asking}
        title="Log out?"
        message="You will need a new emailed code to sign in again."
        confirmLabel="Yes, log out"
        cancelLabel="Stay"
        stacked
        loading={busy}
        onConfirm={onLogout}
        onCancel={() => setAsking(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 18, paddingBottom: 24 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.light.lime },
  name: { fontSize: 15, fontWeight: '700', color: Colors.light.text },
  email: { fontSize: 14, color: Colors.light.muted },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
});
