import { useMutation } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { useCodeEntry } from '@/components/auth/use-code-entry';
import { FieldMessage } from '@/components/auth/field-message';
import { PasswordRules, passwordMeetsRules } from '@/components/auth/password-rules';
import { Button, useButtonStatus } from '@/components/ui/button';
import { ConfirmTick } from '@/components/ui/confirm-tick';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { formatCountdown } from '@/hooks/use-countdown';
import { ApiError } from '@/lib/api';
import { forgotPassword, resetPassword } from '@/services/auth';
import { maskEmail } from '@/store/admin-challenge';

// Frames 3 to 6 of arena-hub-player-app-auth-2-fixed.html on one route:
//   code     six boxes (the shared code entry); the sixth digit opens the next step; "Send a new code in 0:42"
//   password the new password with the live rule list and the eye
//   done     the tick, "Log in"
//   failed   "That code did not work" with the server's own words: Send a new code / Back to log in
// The API has no separate "check the code" step, so email, code and password
// go together once, at the end of the password step. A code the server
// refuses is therefore found there and ends on the failed screen; the typed
// password stays in memory while the user asks for a new code.
type Step = 'code' | 'password' | 'done' | 'failed';

/** The server's messages about the code itself (as opposed to the password): app/shared/codes.py. */
function isCodeProblem(err: unknown): boolean {
  return err instanceof ApiError && /code is not right|too many wrong tries/i.test(err.message);
}

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('code');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();
  const masked = email ? maskEmail(email) : '';

  // the code was just sent by the screen before this one, so the 60 s wait starts now
  const entry = useCodeEntry({
    sentTo: masked,
    onVerify: async () => setStep('password'),
    onResend: () => forgotPassword(email!),
    onResent: () => setStep('code'),
  });
  const code = entry.code;

  const submit = useMutation({
    mutationFn: () => resetPassword(email!, code, password),
    onSuccess: () => {
      flash('success');
      setStep('done');
    },
    onError: (err) => {
      flash('error');
      if (isCodeProblem(err)) {
        setFailMessage((err as ApiError).message);
        setStep('failed');
      } else if (err instanceof ApiError) {
        setError(err.message); // e.g. "You cannot reuse one of your last 3 passwords."
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    },
  });

  if (!email) return <Redirect href="/(auth)/forgot-password" />;

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
        <Button title="Log in" onPress={() => router.dismissTo('/(auth)/login')} />
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
          <Text style={styles.noteText}>{failMessage ?? 'Ask for a new code and try again.'}</Text>
        </View>
        <View style={styles.stack}>
          {/* the server sends no new code inside 60 s of the last one, so the button waits
              for the same timer (the frame's grey "Send a new code in 0:41") */}
          <Button
            title={entry.waiting ? `Send a new code in ${formatCountdown(entry.remaining)}` : 'Send a new code'}
            disabled={entry.waiting}
            loading={entry.resending}
            onPress={entry.askAgain}
          />
          <Button title="Back to log in" variant="ghost" onPress={() => router.dismissTo('/(auth)/login')} />
        </View>
        {entry.error ? <FieldMessage>{entry.error}</FieldMessage> : null}
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

  return (
    <AuthScreen
      title="Enter the code"
      subtitleGap={20}
      subtitle={
        <>
          If an account exists for <Text style={styles.strong}>{masked}</Text>, a 6-digit code is on its way.
        </>
      }>
      {entry.boxes}
      <View style={styles.button}>
        <Button title="Continue" disabled={!entry.ready} onPress={entry.confirm} />
      </View>
      <View style={styles.resendRow}>{entry.resendLink}</View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 11 },
  gap: { height: 5 },
  strong: { fontWeight: '700', color: Colors.light.text },
  button: { marginTop: 20 },
  resendRow: { marginTop: 3 },
  tick: { alignItems: 'center', marginTop: 18 },
  doneTitle: { fontSize: 25, lineHeight: 27, fontWeight: '700', letterSpacing: -0.75, color: Colors.light.text, textAlign: 'center', marginTop: 20 },
  doneSub: { fontSize: 14, lineHeight: 20, color: Colors.light.muted, textAlign: 'center', marginTop: 6, marginBottom: 20 },
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
  noteText: { fontSize: 14, lineHeight: 20, color: '#8E2A2A' },
  stack: { gap: 10 },
});
