import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CodeBoxes } from '@/components/ui/code-boxes';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { ApiError } from '@/lib/api';

/**
 * The "enter the 6-digit code we sent" part of the phone, email and password changes. It owns the code, the wrong-code
 * message, the 60 s wait before a new code and the double-tap guard; the screen says what to do with a good code.
 * Returns the code box row (`view`) and a `confirm()` for the screen's button.
 */
export function useCodeStep({ onVerify, onResend }: { onVerify: (code: string) => Promise<void>; onResend: () => Promise<void> }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const wait = useCountdown(60);

  const verify = useMutation({
    mutationFn: () => onVerify(code),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Invalid code. Try again.'),
  });
  const resend = useMutation({
    mutationFn: onResend,
    onSuccess: () => {
      setCode('');
      setError(null);
      showToast('New code sent');
      wait.restart();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) wait.restart();
      setError(err instanceof ApiError ? err.message : 'Could not send a new code.');
    },
  });

  const confirm = () => {
    if (code.length < 6 || verify.isPending) return;
    setError(null);
    verify.mutate();
  };

  const view = (
    <View style={{ gap: 10 }}>
      <CodeBoxes
        value={code}
        onChange={(c) => {
          setCode(c);
          setError(null);
        }}
        error={!!error}
        autoFocus
        onSubmit={confirm}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {wait.running ? (
        <View style={styles.resendPress}>
          <Text style={styles.resend}>
            Send a new code in <Text style={styles.strong}>{formatCountdown(wait.remaining)}</Text>
          </Text>
        </View>
      ) : (
        <Pressable onPress={() => !resend.isPending && resend.mutate()} disabled={resend.isPending} accessibilityRole="button" accessibilityLabel="Send a new code" style={styles.resendPress}>
          <Text style={styles.resend}>
            {resend.isPending ? (
              'Sending…'
            ) : (
              <>
                Did not get a code? <Text style={styles.strong}>Send a new one</Text>
              </>
            )}
          </Text>
        </Pressable>
      )}
    </View>
  );
  return { view, confirm, ready: code.length === 6, loading: verify.isPending };
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700', color: Colors.light.text },
  error: { fontSize: 14, lineHeight: 20, color: Colors.light.destructive },
  resend: { fontSize: 14, color: Colors.light.muted, textAlign: 'center' },
  resendPress: { minHeight: 44, justifyContent: 'center' },
});
