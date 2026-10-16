import { Redirect, router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { useCodeEntry } from '@/components/auth/use-code-entry';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { fetchMe, resendAdminCode, verifyAdminCode } from '@/services/auth';
import { useAdminChallenge } from '@/store/admin-challenge';
import { useAuthStore } from '@/store/auth';

// Frames 7 and 8 of arena-hub-player-app-auth-2-fixed.html. The challenge token the
// server gave after the right password lives in memory only
// (store/admin-challenge); it is never written to SecureStore.
export default function AdminCodeScreen() {
  const challengeToken = useAdminChallenge((s) => s.challengeToken);
  const sentTo = useAdminChallenge((s) => s.sentTo);
  const codeSent = useAdminChallenge((s) => s.codeSent);

  /** An expired or invalid sign-in step: back to Log in with a short message. */
  const startAgain = (err: unknown) => {
    if (!(err instanceof ApiError && err.status === 401)) return false;
    useAdminChallenge.getState().clear();
    router.dismissTo({ pathname: '/(auth)/login', params: { notice: 'Your sign-in step expired. Please log in again.' } } as Href);
    return true;
  };

  const entry = useCodeEntry({
    sentTo: sentTo ?? undefined,
    codeSent,
    onError: startAgain,
    onVerify: async (code) => {
      const tokens = await verifyAdminCode(challengeToken!, code);
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      useAdminChallenge.getState().clear();
      useAuthStore.getState().setSession(tokens, me);
      router.replace('/admin' as Href);
    },
    onResend: () => resendAdminCode(challengeToken!),
  });

  if (!challengeToken || !sentTo) return <Redirect href="/(auth)/login" />;

  return (
    <AuthScreen
      title="Verification code"
      subtitleGap={20}
      onBack={() => {
        useAdminChallenge.getState().clear();
        router.dismissTo('/(auth)/login');
      }}
      subtitle={
        <>
          Enter the 6-digit sign-in code we emailed to <Text style={styles.strong}>{sentTo}</Text>. It works for 10 minutes.
        </>
      }>
      {entry.boxes}
      <View style={styles.button}>
        <Button title="Verify and sign in" disabled={!entry.ready} loading={entry.loading} onPress={entry.confirm} />
      </View>
      <View style={styles.resend}>{entry.resendLink}</View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700', color: Colors.light.text },
  button: { marginTop: 20 },
  resend: { marginTop: 3 },
});
