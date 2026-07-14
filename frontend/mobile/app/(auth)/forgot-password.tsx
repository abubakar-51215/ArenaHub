import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { forgotPassword, resetPassword } from '@/services/auth';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: () => forgotPassword(email.trim()),
    onSuccess: () => setStep('reset'),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(token.trim(), newPassword),
    onSuccess: () => router.replace('/(auth)/login'),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 'request' ? (
          <>
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.subtitle}>
              Enter your account email and we&apos;ll send a reset link. In development
              it&apos;s logged to the backend console.
            </Text>
            <View style={styles.form}>
              <TextField
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Button
                title="Send Reset Link"
                loading={requestMutation.isPending}
                onPress={() => {
                  setError(null);
                  requestMutation.mutate();
                }}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Enter your reset code</Text>
            <Text style={styles.subtitle}>
              Paste the reset token you received and choose a new password.
            </Text>
            <View style={styles.form}>
              <TextField
                label="Reset Token"
                autoCapitalize="none"
                value={token}
                onChangeText={setToken}
                placeholder="Reset token"
              />
              <TextField
                label="New Password"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <Button
                title="Reset Password"
                loading={resetMutation.isPending}
                onPress={() => {
                  setError(null);
                  resetMutation.mutate();
                }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 24, lineHeight: 20 },
  form: { gap: 14 },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
});
