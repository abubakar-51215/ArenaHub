import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { fetchMe, verifyOtp } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

export default function VerifyOtpScreen() {
  const { email, sentTo } = useLocalSearchParams<{ email: string; sentTo?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);

  const mutation = useMutation({
    mutationFn: async () => {
      const tokens = await verifyOtp(email, code.trim());
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your account</Text>
      <Text style={styles.subtitle}>
        We sent a 6-digit code to {sentTo ?? email}. In development it&apos;s logged to the
        backend console instead of actually being emailed.
      </Text>

      <TextField
        label="Verification Code"
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        placeholder="123456"
        style={styles.codeInput}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Button
        title="Verify"
        loading={mutation.isPending}
        onPress={() => {
          setError(null);
          mutation.mutate();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, lineHeight: 20 },
  codeInput: { fontSize: 22, letterSpacing: 8, textAlign: 'center' },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
});
