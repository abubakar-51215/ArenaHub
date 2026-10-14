import { useMutation } from '@tanstack/react-query';
import { Link, router, useLocalSearchParams, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput as RNTextInput } from 'react-native';

import { ScreenLoader } from '@/components/brand/screen-loader';
import { GoogleButton, useGoogleSignIn } from '@/components/auth/google-button';
import { OrRule } from '@/components/auth/or-rule';
import { AuthScreen } from '@/components/auth/auth-screen';
import { FieldMessage } from '@/components/auth/field-message';
import { Button, useButtonStatus } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { BodyLetterSpacing, Colors, Font } from '@/constants/theme';
import { ApiError, RequestTimeoutError } from '@/lib/api';
import { linkFitsRole, takePendingLink } from '@/lib/deeplink';
import { startupLog } from '@/lib/startup-log';
import { fetchMe, isAdminChallenge, login } from '@/services/auth';
import { maskEmail, useAdminChallenge } from '@/store/admin-challenge';
import { LOGIN_CALL_TIMEOUT_MS, LOGIN_LOADER_AFTER_MS, LOGIN_LOADER_MAX_MS } from '@/constants/brand';
import { useWindowedFlag } from '@/hooks/useDelayedFlag';
import { useAuthStore } from '@/store/auth';
import { useStartup } from '@/store/startup';

// Frame 1 of arena-hub-player-app-auth-2-fixed.html. The first field takes an email
// or a phone number and is sent as `identifier`; the server answers a wrong
// password and an unknown account in the same words, so this screen shows the
// server's message as it is.
/** The 403 "Verify your email to continue." answer for an account whose email is not confirmed yet. */
type VerifyEmailData = { email?: string; sent_to?: string; code_sent?: boolean };

export default function LoginScreen() {
  // set when an admin's sign-in step expired (Admin code screen sends them back here)
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();
  const passwordRef = useRef<RNTextInput>(null);
  const setSession = useAuthStore((s) => s.setSession);
  // the saved sign-in could not be checked because the server could not be reached (see the root layout)
  const unreachable = useStartup((s) => s.unreachable);
  const checking = useStartup((s) => s.checking);
  const retryCheck = useStartup((s) => s.retry);

  const mutation = useMutation({
    mutationFn: async () => {
      const who = identifier.trim();
      startupLog('login: checking the password');
      const result = await login(who, password, { timeoutMs: LOGIN_CALL_TIMEOUT_MS });
      startupLog('login: password accepted');
      if (isAdminChallenge(result)) return { kind: 'admin' as const, challenge: result, who };
      // Stash the token immediately so the fetchMe call below is authed.
      useAuthStore.getState().setTokens(result);
      startupLog('login: loading the account (GET /users/me)');
      const me = await fetchMe({ timeoutMs: LOGIN_CALL_TIMEOUT_MS });
      startupLog('login: account loaded, opening Home');
      return { kind: 'ok' as const, tokens: result, me };
    },
    onSuccess: (r) => {
      if (r.kind === 'admin') {
        // an admin: a code was emailed; the token lives in memory only
        useAdminChallenge.getState().set(r.challenge.challenge_token, r.challenge.sent_to || maskEmail(r.who), r.challenge.code_sent !== false);
        router.push('/(auth)/admin-code' as Href);
        return;
      }
      flash('success');
      setSession(r.tokens, r.me);
      router.replace(r.me.role === 'admin' ? ('/admin' as Href) : '/(tabs)');
      // a link that was opened while signed out: Home first, then the link
      const link = takePendingLink();
      if (link && r.me.role !== 'admin' && linkFitsRole(link, r.me.role)) setTimeout(() => router.push(link as Href), 350);
    },
    onError: (err) => {
      startupLog(`login: failed (${err instanceof Error ? err.message : 'unknown'})`);
      // the account could not be loaded after the password was accepted: do not keep half a sign-in
      if (useAuthStore.getState().accessToken && !useAuthStore.getState().user) useAuthStore.getState().clear();
      // the email is not confirmed yet: the server sent a fresh code (or says why it could not); the code screen opens
      const verify = err instanceof ApiError && err.status === 403 ? (err.data as VerifyEmailData | null) : null;
      if (verify?.email) {
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email: verify.email, sentTo: verify.sent_to ?? '', codeSent: verify.code_sent ? '1' : '0' },
        });
        return;
      }
      flash('error');
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (err instanceof RequestTimeoutError) {
        setError('The server is taking too long. Check your connection and try again.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    },
  });

  // sign-in that takes longer than half a second shows the full-screen loader, and never for longer than 10 seconds
  const slow = useWindowedFlag(mutation.isPending, LOGIN_LOADER_AFTER_MS, LOGIN_LOADER_MAX_MS);

  // Continue with Google (frames 1, 2 and 8 to 12 of arena-hub-player-app-google.html); a refused account's words
  // show in the red box above the fields (frames 10 and 11)
  const [refused, setRefused] = useState<string | null>(null);
  const google = useGoogleSignIn(setRefused);

  const submit = () => {
    if (mutation.isPending || google.busy) return;
    setError(null);
    setRefused(null);
    if (!identifier.trim() || !password) {
      setError('Enter your email or phone number and your password.');
      flash('error');
      return;
    }
    mutation.mutate();
  };

  return (
    <>
    <AuthScreen hideBack showMark title="Welcome back" subtitle="Log in with your email or phone number.">
      {unreachable ? (
        <View style={styles.note} accessibilityRole="alert">
          <Text style={styles.noteText}>Cannot reach the server. Check your connection.</Text>
          <Pressable onPress={() => retryCheck?.()} disabled={checking} accessibilityRole="button" accessibilityLabel="Try again" style={styles.retry}>
            <Text style={styles.retryText}>{checking ? 'Trying…' : 'Try again'}</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.note} accessibilityRole="alert">
          <Text style={styles.noteText}>{notice}</Text>
        </View>
      ) : null}
      {refused ? (
        <View style={styles.refused} accessibilityRole="alert">
          <Text style={styles.refusedText}>{refused}</Text>
        </View>
      ) : null}
      <View style={styles.form}>
        <Field
          icon="mail"
          placeholder="Email or phone"
          value={identifier}
          onChangeText={(t) => {
            setIdentifier(t);
            setError(null);
          }}
          error={!!error}
          autoComplete="username"
          textContentType="username"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          accessibilityLabel="Email or phone"
        />
        <Field
          ref={passwordRef}
          icon="lock"
          revealable
          placeholder="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            setError(null);
          }}
          error={!!error}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabel="Password"
        />
        {error ? <FieldMessage>{error}</FieldMessage> : null}
        <View style={styles.forgotRow}>
          <Link href="/(auth)/forgot-password" style={styles.forgot} accessibilityRole="link">
            Forgot password?
          </Link>
        </View>
        <Button title="Log in" loading={mutation.isPending} disabled={google.busy} status={btnStatus} onPress={submit} />
        <OrRule />
        <GoogleButton
          title="Continue with Google"
          busy={google.busy}
          disabled={mutation.isPending}
          onPress={() => {
            setError(null);
            setRefused(null);
            void google.start();
          }}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New here? </Text>
        <Link href="/(auth)/register" style={styles.footerLink} accessibilityRole="link">
          Create account
        </Link>
      </View>
    </AuthScreen>
    {slow ? (
      <View style={styles.loading} accessibilityViewIsModal>
        <ScreenLoader top={0} />
      </View>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // the sign-in wait: a full-screen loader over the form, only after half a second
  loading: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.light.paper, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  // .note.info of the auth-2 frames
  note: { backgroundColor: '#EEF6D6', borderColor: '#D9EBA0', borderWidth: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontSize: 14, fontWeight: '700', color: '#4D6410' },
  noteText: { fontSize: 14, lineHeight: 20, color: '#4D6410' },
  form: { gap: 11 },
  // the red .note of the auth frames: a refused Google sign-in (suspended, or an owner or admin account)
  refused: { backgroundColor: '#FBEAEA', borderColor: '#F1C9C9', borderWidth: 1, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 12 },
  refusedText: { fontSize: 14, lineHeight: 20, color: '#8E2A2A' },
  // right aligned; the link has 14px above and below so its tap area is 44 high
  forgotRow: { alignItems: 'flex-end', marginTop: -14 },
  forgot: { fontSize: 14, fontFamily: Font.bodyBold, letterSpacing: BodyLetterSpacing, color: Colors.light.text, paddingVertical: 14, paddingLeft: 12, paddingRight: 6 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44, marginTop: 4 },
  footerText: { fontSize: 14, color: Colors.light.muted },
  footerLink: { fontSize: 14, fontFamily: Font.bodyBold, letterSpacing: BodyLetterSpacing, color: Colors.light.text, paddingVertical: 14, paddingHorizontal: 6 },
});
