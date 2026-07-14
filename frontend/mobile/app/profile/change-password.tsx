import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { requestPasswordChange, verifyPasswordChange } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

export default function ChangePasswordScreen() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const requestMutation = useMutation({
    mutationFn: () => requestPasswordChange(currentPassword, newPassword),
    onSuccess: () => setStep('otp'),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  const verifyMutation = useMutation({
    mutationFn: () => verifyPasswordChange(code),
    onSuccess: () => {
      // The backend revokes every session on success — send the user back
      // to log in with the new password.
      Alert.alert('Password changed', 'Please log in again with your new password.', [
        {
          text: 'OK',
          onPress: () => {
            clear();
            router.replace('/(auth)/login');
          },
        },
      ]);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  const formValid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>Change Password</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === 'form' ? (
            <>
              <TextField
                label="Current Password"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <TextField
                label="New Password"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TextField
                label="Confirm New Password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={
                  confirmPassword.length > 0 && confirmPassword !== newPassword
                    ? 'Passwords do not match.'
                    : null
                }
              />
              <Text style={styles.hint}>
                At least 8 characters, with an uppercase letter, a digit, and a special character.
                You can’t reuse one of your last 3 passwords.
              </Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                title="Send Verification Code"
                loading={requestMutation.isPending}
                disabled={!formValid}
                onPress={() => {
                  setError(null);
                  requestMutation.mutate();
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.otpInfo}>
                We sent a 6-digit code to {user?.email}. Enter it below to confirm your new
                password.
              </Text>
              <TextField
                label="Verification Code"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button
                title="Confirm Password Change"
                loading={verifyMutation.isPending}
                disabled={code.length !== 6}
                onPress={() => {
                  setError(null);
                  verifyMutation.mutate();
                }}
              />
              <Button title="Back" variant="ghost" onPress={() => setStep('form')} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  content: { padding: 20, gap: 14 },
  hint: { fontSize: 12, color: Colors.light.muted, lineHeight: 17 },
  otpInfo: { fontSize: 14, color: Colors.light.text, lineHeight: 20 },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
});
