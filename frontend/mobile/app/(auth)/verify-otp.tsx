import { useMutation } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { ApiError } from '@/lib/api';
import { fetchMe, resendOtp, verifyOtp } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// The backend will not send a second code within 60 s of the first, so the
// Resend link waits the same time (arena-hub-player-app-auth.html: "Resend
// code in 0:47"). The code was sent just before this screen opened.
const RESEND_WAIT = 60;

export default function VerifyOtpScreen() {
  const { email, sentTo } = useLocalSearchParams<{ email?: string; sentTo?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);
  const wait = useCountdown(RESEND_WAIT);

  const resend = useMutation({
    mutationFn: () => resendOtp(email!),
    onSuccess: () => {
      setError(null);
      setCode('');
      showToast(`New code sent to ${sentTo ?? email}`);
      wait.restart();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) wait.restart(); // "wait a minute"
      setError(err instanceof ApiError ? err.message : 'Could not resend the code.');
    },
  });

  const verify = useMutation({
    mutationFn: async () => {
      const tokens = await verifyOtp(email!, code);
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      return { tokens, me };
    },
    onSuccess: ({ tokens, me }) => {
      setSession(tokens, me);
      router.replace('/(tabs)');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Invalid code. Try again.');
    },
  });

  if (!email) return <Redirect href="/(auth)/register" />;

  const submit = () => {
    if (code.length < 6 || verify.isPending) return;
    setError(null);
    verify.mutate();
  };

  return (
    <AuthScreen
      showMark
      title="Check your email"
      subtitleGap={22}
      subtitle={
        <>
          We sent a 6-digit code to <Text style={styles.strong}>{sentTo ?? email}</Text>.
        </>
      }>
      <CodeBoxes
        value={code}
        onChange={(c) => {
          setCode(c);
          setError(null);
        }}
        error={!!error}
        autoFocus
        onSubmit={submit}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.button}>
        <Button title="Verify" loading={verify.isPending} disabled={code.length < 6} onPress={submit} />
      </View>

      {wait.running ? (
        <View style={styles.resendPress}>
          <Text style={styles.resend}>
            Resend code in <Text style={styles.strong}>{formatCountdown(wait.remaining)}</Text>
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={() => resend.mutate()}
          disabled={resend.isPending}
          accessibilityRole="button"
          accessibilityLabel="Resend code"
          style={styles.resendPress}>
          <Text style={styles.resend}>
            {resend.isPending ? (
              'Sending…'
            ) : (
              <>
                Didn&apos;t get a code? <Text style={styles.strong}>Resend</Text>
              </>
            )}
          </Text>
        </Pressable>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700', color: Colors.light.text },
  // .field-err / .field-hint: 11px under the field
  error: { fontSize: 14, color: Colors.light.redText, marginTop: 10, paddingHorizontal: 2 },
  button: { marginTop: 22 },
  resend: { fontSize: 14, color: Colors.light.muted, textAlign: 'center' },
  // 12px text in a 44px touch row, so the link is easy to hit
  resendPress: { marginTop: 3, minHeight: 44, justifyContent: 'center' },
});
