import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import { useCodeStep } from '@/components/g6/code-step';
import { FormScreen } from '@/components/g6/form-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestEmailChange, verifyEmailChange } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// Change email, from arena-hub-player-app-account.html (frame 08): the new address and the current password (the field
// from frame 09: the server checks it before it sends anything), then the 6-digit code sent to the new address. The old
// address stays until that code is used; Back from the code keeps what was typed.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const note = { fontSize: 14, lineHeight: 20, color: Colors.light.muted } as const;

export default function ChangeEmailScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const passwordRef = useRef<TextInput>(null);

  const send = useMutation({
    mutationFn: () => requestEmailChange(email.trim(), password),
    onSuccess: () => setSent(true),
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Could not send the code. Please try again.';
      setErrors(/password/i.test(message) ? { password: message } : { email: message });
    },
  });
  const submit = () => {
    if (send.isPending) return;
    if (!EMAIL.test(email.trim())) return setErrors({ email: 'Enter a valid email address.' });
    if (!password) return setErrors({ password: 'Enter your current password.' });
    setErrors({});
    send.mutate();
  };

  const step = useCodeStep({
    onVerify: async (code) => {
      const user = await verifyEmailChange(code);
      setUser(user);
      showToast('Email changed');
      router.back();
    },
    onResend: () => requestEmailChange(email.trim(), password),
  });

  return (
    <FormScreen
      title="Change email"
      onBack={sent ? () => setSent(false) : undefined}
      footer={
        sent ? (
          <Button title="Confirm" loading={step.loading} disabled={!step.ready} onPress={step.confirm} />
        ) : (
          <Button title="Send code" loading={send.isPending} disabled={!email.trim() || !password} onPress={submit} />
        )
      }>
      {sent ? (
        <>
          <Text style={note}>We sent a 6-digit code to {email.trim()}. Enter it to change your email.</Text>
          {step.view}
        </>
      ) : (
        <>
          <Text style={note}>Enter your new email. We will send a 6-digit code to it.</Text>
          <TextField
            label="New email"
            kind="email"
            placeholder="name@example.com"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setErrors({});
            }}
            error={errors.email}
            nextRef={passwordRef}
            autoFocus
          />
          <TextField
            ref={passwordRef}
            label="Current password"
            kind="password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrors({});
            }}
            error={errors.password}
            onSubmit={submit}
          />
        </>
      )}
    </FormScreen>
  );
}
