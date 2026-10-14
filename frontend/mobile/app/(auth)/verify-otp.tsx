import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { useCodeEntry } from '@/components/auth/use-code-entry';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { fetchMe, resendOtp, verifyOtp } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// "Check your email" (arena-hub-player-app-auth.html, OTP verify): opened after sign-up, and after signing in to an
// account whose email is not confirmed yet. `sentTo` is the masked address from the server; `codeSent=0` means the
// email could not go out, so the screen says so and "Send a new code" is ready at once. Back returns to the form with
// what was typed still there (this screen is pushed on top of it).
export default function VerifyOtpScreen() {
  const { email, sentTo, codeSent } = useLocalSearchParams<{ email?: string; sentTo?: string; codeSent?: string }>();
  const setSession = useAuthStore((s) => s.setSession);

  const entry = useCodeEntry({
    sentTo,
    codeSent: codeSent !== '0',
    onVerify: async (code) => {
      const tokens = await verifyOtp(email!, code);
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      setSession(tokens, me);
      router.replace('/(tabs)');
    },
    onResend: () => resendOtp(email!),
  });

  if (!email) return <Redirect href="/(auth)/register" />;

  return (
    <AuthScreen
      showMark
      title="Check your email"
      subtitleGap={22}
      subtitle={sentTo ? (
        <>
          We sent a 6-digit code to <Text style={styles.strong}>{sentTo}</Text>.
        </>
      ) : (
        'We sent a 6-digit code to your email.'
      )}>
      {entry.boxes}
      <View style={styles.button}>
        <Button title="Verify" loading={entry.loading} disabled={!entry.ready} onPress={entry.confirm} />
      </View>
      <View style={styles.resend}>{entry.resendLink}</View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700', color: Colors.light.text },
  button: { marginTop: 22 },
  resend: { marginTop: 3 },
});
