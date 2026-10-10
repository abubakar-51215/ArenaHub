import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { logout } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// TEMPORARY until the admin group (frame 9 of arena-hub-player-app-auth-2.html).
// It only shows that an admin's sign-in worked, and lets them log out. The
// real admin home is designed separately.
export default function AdminLandingScreen() {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const [asking, setAsking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // clear the local session regardless
    } finally {
      useAuthStore.getState().clear();
      router.replace('/(auth)/login');
    }
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <View style={styles.pad}>
        <View style={styles.badge}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" stroke={Colors.light.lime} strokeWidth={2} strokeLinejoin="round" />
            <Path d="M8.5 12l2.5 2.5 4.5-5" stroke={Colors.light.lime} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text style={styles.badgeText}>Admin</Text>
        </View>
        <Text variant="archivo" style={styles.title} accessibilityRole="header">
          Hello, Admin
        </Text>
        <Text style={styles.sub}>
          The admin home is designed separately. This temporary screen only shows that sign-in worked.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Signed in as</Text>
          <Text variant="archivo" style={styles.cardValue}>
            {user?.email ?? ''}
          </Text>
        </View>
        <View style={styles.button}>
          <Button title="Log out" variant="ghost" onPress={() => setAsking(true)} />
        </View>
      </View>
      <ConfirmSheet
        visible={asking}
        title="Log out?"
        message="You will need your password and a new email code to sign in again."
        confirmLabel="Log out"
        loading={loggingOut}
        onConfirm={onLogout}
        onCancel={() => !loggingOut && setAsking(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.light.paper },
  pad: { paddingHorizontal: 20, paddingTop: 20 },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.ink,
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.05, textTransform: 'uppercase', color: Colors.light.lime },
  title: { fontSize: 25, lineHeight: 27, fontWeight: '700', letterSpacing: -0.63, color: Colors.light.text, marginTop: 12 },
  sub: { fontSize: 13.5, lineHeight: 19.6, color: Colors.light.muted, marginTop: 6 },
  card: {
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
  },
  cardLabel: { fontSize: 11, letterSpacing: 0.88, textTransform: 'uppercase', color: Colors.light.muted },
  cardValue: { fontSize: 20, fontWeight: '700', color: Colors.light.text, marginTop: 4 },
  button: { marginTop: 16 },
});
