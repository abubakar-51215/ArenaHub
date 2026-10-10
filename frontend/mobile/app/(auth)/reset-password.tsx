import { useMutation } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { FieldMessage } from '@/components/auth/field-message';
import { PasswordRules, passwordMeetsRules } from '@/components/auth/password-rules';
import { Button, useButtonStatus } from '@/components/ui/button';
import { CodeBoxes } from '@/components/ui/code-boxes';
import { ConfirmTick } from '@/components/ui/confirm-tick';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { ApiError } from '@/lib/api';
import { forgotPassword, resetPassword } from '@/services/auth';
import { maskEmail } from '@/store/admin-challenge';

// Frames 3 to 6 of arena-hub-player-app-auth-2.html on one route:
//   code     six boxes, Continue turns dark at 6 digits, Resend after 60 s
//   password the new password with the live rule list and the eye
//   done     the tick, "Log in"
//   failed   "That code did not work": Send a new code / Back to log in
// The API has no separate "check the code" step, so email, code and password
// go together once, at the end of the password step. A code the server
// refuses is therefore found there and ends on the failed screen; the typed
// password stays in memory while the user asks for a new code.
type Step = 'code' | 'password' | 'done' | 'failed';
const RESEND_WAIT = 60;

/** Server messages about the code itself (as opposed to the password). */
function isCodeProblem(err: unknown): boolean {
  return err instanceof ApiError && /verification code|too many incorrect attempts/i.test(err.message);
}

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();
  const wait = useCountdown(RESEND_WAIT); // the code was just sent by the screen before this one

  const resend = useMutation({
    mutationFn: () => forgotPassword(email!),
    onSuccess: () => {
      setError(null);
      setCode('');
      setNotice(`New code sent to ${maskEmail(email!)}`);
      wait.restart();
      setStep('code');
    },
    onError: (err) => {
      flash('error');
      setNotice(null);
      setError(err instanceof ApiError ? err.message : 'Could not send a new code. Check your connection.');
    },
  });

  const submit = useMutation({
    mutationFn: () => resetPassword(email!, code, password),
    onSuccess: () => {
      flash('success');
      setStep('done');
    },
    onError: (err) => {
      flash('error');
      if (isCodeProblem(err)) {
        setStep('failed');
      } else if (err instanceof ApiError) {
        setError(err.message); // e.g. "You cannot reuse one of your last 3 passwords."
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    },
  });

  if (!email) return <Redirect href="/(auth)/forgot-password" />;
  const masked = maskEmail(email);

  if (step === 'done') {
    return (
      <AuthScreen hideBack>
        <View style={styles.tick}>
          <ConfirmTick />
        </View>
        <Text variant="archivo" style={styles.doneTitle} accessibilityRole="header">
          Password updated
        </Text>
        <Text style={styles.doneSub}>You can log in with your new password. Other devices were signed out.</Text>
        <Button title="Log in" onPress={() => router.replace('/(auth)/login')} />
      </AuthScreen>
    );
  }

  if (step === 'failed') {
    return (
      <AuthScreen
        title="That code did not work"
        subtitle="The code may be wrong, expired or already used. Your new password was not saved."
        onBack={() => setStep('code')}>
        <View style={styles.note} accessibilityRole="alert">
          <Text style={styles.noteText}>For safety we do not say which one it was. Ask for a new code and try again.</Text>
        </View>
        <View style={styles.stack}>
          <Button title="Send a new code" loading={resend.isPending} status={btnStatus} onPress={() => resend.mutate()} />
          <Button title="Back to log in" variant="ghost" onPress={() => router.replace('/(auth)/login')} />
        </View>
        {error ? <FieldMessage>{error}</FieldMessage> : null}
      </AuthScreen>
    );
  }

  if (step === 'password') {
    const submitNow = () => {
      if (submit.isPending) return;
      setError(null);
      if (!passwordMeetsRules(password)) {
        setError('Your password needs every rule below.');
        flash('error');
        return;
      }
      submit.mutate();
    };
    return (
      <AuthScreen title="New password" subtitle="Choose a password you have not used before." onBack={() => setStep('code')}>
        <View style={styles.form}>
          <Field
            icon="lock"
            huge
            revealable
            placeholder="New password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            error={!!error}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            returnKeyType="go"
            onSubmitEditing={submitNow}
            accessibilityLabel="New password"
          />
          {error ? <FieldMessage>{error}</FieldMessage> : null}
          <PasswordRules password={password} />
          <View style={styles.gap} />
          <Button title="Reset password" loading={submit.isPending} status={btnStatus} onPress={submitNow} />
        </View>
      </AuthScreen>
    );
  }

  const full = code.length === 6;
  return (
    <AuthScreen
      title="Enter the code"
      subtitleGap={20}
      subtitle={
        <>
          If an account exists for <Text style={styles.strong}>{masked}</Text>, a 6-digit code is on its way.
        </>
      }>
      <CodeBoxes
        value={code}
        onChange={(c) => {
          setCode(c);
          setError(null);
          setNotice(null);
        }}
        autoFocus
        onSubmit={() => full && setStep('password')}
      />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {notice && !error ? <Text style={styles.notice} accessibilityRole="alert">{notice}</Text> : null}
      <View style={styles.button}>
        <Button title="Continue" disabled={!full} onPress={() => setStep('password')} />
      </View>
      {wait.running ? (
        <View style={styles.resendRow}>
          <Text style={styles.resend}>
            Resend code in <Text style={styles.strong}>{formatCountdown(wait.remaining)}</Text>
          </Text>
        </View>
      ) : (
        <View style={styles.resendRow}>
          <Text
            style={styles.resend}
            onPress={() => resend.mutate()}
            accessibilityRole="button"
            accessibilityLabel="Resend code">
            {resend.isPending ? (
              'Sending…'
            ) : (
              <>
                Didn&apos;t get a code? <Text style={styles.strong}>Resend</Text>
              </>
            )}
          </Text>
        </View>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 11 },
  gap: { height: 5 },
  strong: { fontWeight: '700', color: Colors.light.text },
  error: { fontSize: 11, color: Colors.light.destructive, marginTop: 10, paddingHorizontal: 2 },
  notice: { fontSize: 11, color: Colors.light.limeDeep, marginTop: 10, paddingHorizontal: 2 },
  button: { marginTop: 20 },
  resendRow: { marginTop: 3, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  resend: { fontSize: 13, color: Colors.light.muted, textAlign: 'center', paddingVertical: 14 },
  tick: { alignItems: 'center', marginTop: 18 },
  doneTitle: { fontSize: 25, lineHeight: 27, fontWeight: '700', letterSpacing: -0.75, color: Colors.light.text, textAlign: 'center', marginTop: 20 },
  doneSub: { fontSize: 13, lineHeight: 19, color: Colors.light.muted, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  // .note in the failed frame
  note: {
    backgroundColor: '#FBEAEA',
    borderColor: '#F1C9C9',
    borderWidth: 1,
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  noteText: { fontSize: 12.5, lineHeight: 17.5, color: '#8E2A2A' },
  stack: { gap: 10 },
});
