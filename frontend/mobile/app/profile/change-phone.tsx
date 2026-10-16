import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCodeStep } from '@/components/g6/code-step';
import { FormScreen } from '@/components/g6/form-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestPhoneChange, verifyPhoneChange } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// Change phone number: the same two steps as Change email (the new number, then the 6-digit code sent to it).
const note = { fontSize: 14, lineHeight: 20, color: Colors.light.muted } as const;

export default function ChangePhoneScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => requestPhoneChange(phone.trim()),
    onSuccess: () => setSent(true),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.'),
  });
  const submit = () => {
    if (send.isPending) return;
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter a valid phone number.');
    setError(null);
    send.mutate();
  };

  const step = useCodeStep({
    onVerify: async (code) => {
      const user = await verifyPhoneChange(code);
      setUser(user);
      showToast('Phone number changed');
      router.back();
    },
    onResend: () => requestPhoneChange(phone.trim()).then(() => undefined),
  });

  return (
    <FormScreen
      title="Change phone number"
      onBack={sent ? () => setSent(false) : undefined}
      footer={
        sent ? (
          <Button title="Confirm" loading={step.loading} disabled={!step.ready} onPress={step.confirm} />
        ) : (
          <Button title="Send code" loading={send.isPending} disabled={!phone.trim()} onPress={submit} />
        )
      }>
      {sent ? (
        <>
          <Text style={note}>We sent a 6-digit code to {phone.trim()}. Enter it to change your number.</Text>
          {step.view}
        </>
      ) : (
        <>
          <Text style={note}>Enter your new phone number. We will send a 6-digit code to it.</Text>
          <TextField
            label="New phone number"
            kind="phone"
            placeholder="03XX XXXXXXX"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            error={error}
            onSubmit={submit}
            autoFocus
          />
        </>
      )}
    </FormScreen>
  );
}
