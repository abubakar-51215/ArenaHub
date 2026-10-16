import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInput as RNTextInput } from 'react-native';

import { PasswordRules, passwordMeetsRules } from '@/components/auth/password-rules';
import { useCodeStep } from '@/components/g6/code-step';
import { FormScreen } from '@/components/g6/form-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestPasswordChange, verifyPasswordChange } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// Change password, from arena-hub-player-app-account.html (frame 09): current, new and repeated password, then the 6-digit
// code sent to the account email. The server signs every session out when it succeeds, so the app goes back to Log in.
const note = { fontSize: 14, lineHeight: 20, color: Colors.light.muted } as const;

export default function ChangePasswordScreen() {
  const clear = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);
  const newRef = useRef<RNTextInput>(null);
  const repeatRef = useRef<RNTextInput>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string; form?: string }>({});

  const send = useMutation({
    mutationFn: () => requestPasswordChange(current, next),
    onSuccess: () => setSent(true),
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Could not send the code. Please try again.';
      setErrors(err instanceof ApiError && err.status === 400 ? { current: message } : { form: message });
    },
  });

  const submit = () => {
    if (send.isPending) return;
    const e: typeof errors = {};
    if (!current) e.current = 'Enter your current password.';
    if (!passwordMeetsRules(next)) e.next = 'Your new password needs every rule below.';
    else if (next === current) e.next = 'Use a password you have not used before.';
    if (repeat !== next) e.repeat = 'The two passwords do not match.';
    setErrors(e);
    if (Object.keys(e).length === 0) send.mutate();
  };

  const step = useCodeStep({
    onVerify: async (code) => {
      await verifyPasswordChange(code);
      // every session was ended by the server: sign in again with the new password
      clear();
      router.replace({ pathname: '/(auth)/login', params: { notice: 'Password changed. Log in with your new password.' } } as never);
    },
    onResend: () => requestPasswordChange(current, next).then(() => undefined),
  });

  return (
    <FormScreen
      title="Change password"
      onBack={sent ? () => setSent(false) : undefined}
      footer={
        sent ? (
          <Button title="Confirm" loading={step.loading} disabled={!step.ready} onPress={step.confirm} />
        ) : (
          <Button title="Update password" loading={send.isPending} disabled={!current || !next || !repeat} onPress={submit} />
        )
      }>
      {sent ? (
        <>
          <Text style={note}>We sent a 6-digit code to {user?.email}. Enter it to confirm the new password.</Text>
          {step.view}
        </>
      ) : (
        <>
          <TextField label="Current password" kind="password" value={current} onChangeText={(t) => { setCurrent(t); setErrors({}); }} error={errors.current} nextRef={newRef} />
          <TextField ref={newRef} label="New password" kind="newPassword" placeholder="At least 8 characters" value={next} onChangeText={(t) => { setNext(t); setErrors({}); }} error={errors.next} nextRef={repeatRef} />
          <TextField ref={repeatRef} label="Repeat new password" kind="newPassword" value={repeat} onChangeText={(t) => { setRepeat(t); setErrors({}); }} error={errors.repeat} onSubmit={submit} />
          <PasswordRules password={next} />
          <View style={{ backgroundColor: Colors.light.limeWash, borderColor: '#D9EBA0', borderWidth: 1, borderRadius: 13, padding: 12 }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.light.noteText }}>Use a password you have not used before.</Text>
          </View>
          {errors.form ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: Colors.light.redText }} accessibilityRole="alert">
              {errors.form}
            </Text>
          ) : null}
        </>
      )}
    </FormScreen>
  );
}
