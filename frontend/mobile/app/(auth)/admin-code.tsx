import { useMutation } from '@tanstack/react-query';
import { Redirect, router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthScreen } from '@/components/auth/auth-screen';
import { Button, useButtonStatus } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { useShake } from '@/hooks/use-shake';
import { ApiError } from '@/lib/api';
import { fetchMe, resendAdminCode, verifyAdminCode } from '@/services/auth';
import { useAdminChallenge, maskEmail } from '@/store/admin-challenge';
import { useAuthStore } from '@/store/auth';

// Frames 7 and 8 of arena-hub-player-app-auth-2.html. The challenge token the
// server gave after the right password lives in memory only
// (store/admin-challenge); it is never written to SecureStore.
const RESEND_WAIT = 60; // the first code went out at Log in

export default function AdminCodeScreen() {
  const challengeToken = useAdminChallenge((s) => s.challengeToken);
  const email = useAdminChallenge((s) => s.email);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();
  const wait = useCountdown(RESEND_WAIT);
  const { style: shakeStyle, shake } = useShake();

  /** An expired or invalid sign-in step: back to Log in with a short message. */
  const startAgain = (message: string) => {
    useAdminChallenge.getState().clear();
    router.dismissTo({ pathname: '/(auth)/login', params: { notice: message } } as Href);
  };

  const verify = useMutation({
    mutationFn: async () => {
      const tokens = await verifyAdminCode(challengeToken!, code);
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      return { tokens, me };
    },
    onSuccess: ({ tokens, me }) => {
      useAdminChallenge.getState().clear();
      useAuthStore.getState().setSession(tokens, me);
      router.replace('/admin' as Href);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        startAgain('Your sign-in step expired. Please log in again.');
        return;
      }
      flash('error');
      shake();
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    },
  });

  const resend = useMutation({
    mutationFn: () => resendAdminCode(challengeToken!),
    onSuccess: () => {
      setError(null);
      setCode('');
      setNotice(`New code sent to ${maskEmail(email!)}`);
      wait.restart();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        startAgain('Your sign-in step expired. Please log in again.');
        return;
      }
      flash('error');
      setNotice(null);
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Check your connection.');
    },
  });

  if (!challengeToken || !email) return <Redirect href="/(auth)/login" />;

  const full = code.length === 6;
  const submit = () => {
    if (!full || verify.isPending) return;
    setError(null);
    setNotice(null);
    verify.mutate();
  };

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
          Enter the 6-digit sign-in code we emailed to <Text style={styles.strong}>{maskEmail(email)}</Text>. It works for 10
          minutes.
        </>
      }>
      <Animated.View style={shakeStyle}>
        <CodeBoxes
          value={code}
          onChange={(c) => {
            setCode(c);
            setError(null);
            setNotice(null);
          }}
          error={!!error}
          autoFocus
          onSubmit={submit}
        />
      </Animated.View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {notice && !error ? (
        <Text style={styles.notice} accessibilityRole="alert">
          {notice}
        </Text>
      ) : null}
      <View style={styles.button}>
        <Button title="Verify and sign in" disabled={!full} loading={verify.isPending} status={btnStatus} onPress={submit} />
      </View>
      <View style={styles.resendRow}>
        {wait.running ? (
          <Text style={styles.resend}>
            Resend code in <Text style={styles.strong}>{formatCountdown(wait.remaining)}</Text>
          </Text>
        ) : (
          <Text style={styles.resend} onPress={() => resend.mutate()} accessibilityRole="button" accessibilityLabel="Send a new code">
            {resend.isPending ? 'Sending…' : <Text style={styles.strong}>Send a new code</Text>}
          </Text>
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700', color: Colors.light.text },
  error: { fontSize: 11, color: Colors.light.destructive, marginTop: 10, paddingHorizontal: 2 },
  notice: { fontSize: 11, color: Colors.light.limeDeep, marginTop: 10, paddingHorizontal: 2 },
  button: { marginTop: 20 },
  resendRow: { marginTop: 3, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  resend: { fontSize: 13, color: Colors.light.muted, textAlign: 'center', paddingVertical: 14 },
});
