import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import {
  deleteAccount,
  requestEmailChange,
  requestPhoneChange,
  updateProfile,
  verifyEmailChange,
  verifyPhoneChange,
} from '@/services/auth';
import { useAuthStore } from '@/store/auth';

const NOTIFICATION_TOGGLES: { key: string; label: string; hint: string }[] = [
  { key: 'push_enabled', label: 'Push notifications', hint: 'Booking reminders and match updates' },
  { key: 'email_enabled', label: 'Email notifications', hint: 'Receipts and account activity' },
  { key: 'match_invites', label: 'Match invites', hint: 'Open matches looking for players' },
];

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong.';
}

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  const prefs = user?.notification_preferences ?? {};

  const prefsMutation = useMutation({
    mutationFn: (next: Record<string, boolean>) =>
      updateProfile({ notification_preferences: next }),
    onSuccess: (updated) => setUser(updated),
  });

  function toggle(key: string, value: boolean) {
    prefsMutation.mutate({ ...prefs, [key]: value });
  }

  // ---- email change ----
  const [emailStep, setEmailStep] = useState<'closed' | 'form' | 'otp'>('closed');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const requestEmailMutation = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim()),
    onSuccess: () => {
      setEmailError(null);
      setEmailStep('otp');
    },
    onError: (err) => setEmailError(errMessage(err)),
  });
  const verifyEmailMutation = useMutation({
    mutationFn: () => verifyEmailChange(emailCode),
    onSuccess: (updated) => {
      setUser(updated);
      setEmailStep('closed');
      setNewEmail('');
      setEmailCode('');
    },
    onError: (err) => setEmailError(errMessage(err)),
  });

  // ---- phone change ----
  const [phoneStep, setPhoneStep] = useState<'closed' | 'form' | 'otp'>('closed');
  const [newPhone, setNewPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const requestPhoneMutation = useMutation({
    mutationFn: () => requestPhoneChange(newPhone.trim()),
    onSuccess: () => {
      setPhoneError(null);
      setPhoneStep('otp');
    },
    onError: (err) => setPhoneError(errMessage(err)),
  });
  const verifyPhoneMutation = useMutation({
    mutationFn: () => verifyPhoneChange(phoneCode),
    onSuccess: (updated) => {
      setUser(updated);
      setPhoneStep('closed');
      setNewPhone('');
      setPhoneCode('');
    },
    onError: (err) => setPhoneError(errMessage(err)),
  });

  // ---- delete account ----
  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      clear();
      router.replace('/(auth)/login');
    },
    onError: (err) => Alert.alert('Could not delete account', errMessage(err)),
  });

  function confirmDelete() {
    Alert.alert(
      'Delete account',
      'This schedules your account for deletion. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>Notifications</Text>
          {NOTIFICATION_TOGGLES.map((t) => (
            <View key={t.key} style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>{t.label}</Text>
                <Text style={styles.toggleHint}>{t.hint}</Text>
              </View>
              <Switch
                value={prefs[t.key] ?? false}
                onValueChange={(v) => toggle(t.key, v)}
                trackColor={{ true: Colors.light.tint }}
              />
            </View>
          ))}

          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Account</Text>

          {emailStep === 'closed' ? (
            <Pressable style={styles.linkRow} onPress={() => setEmailStep('form')}>
              <Text style={styles.linkLabel}>Change email</Text>
              <Text style={styles.linkValue}>{user?.email}</Text>
            </Pressable>
          ) : (
            <View style={styles.inlineForm}>
              {emailStep === 'form' ? (
                <>
                  <TextField
                    label="New email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={newEmail}
                    onChangeText={setNewEmail}
                  />
                  {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  <View style={styles.inlineActions}>
                    <Button title="Cancel" variant="ghost" onPress={() => setEmailStep('closed')} />
                    <Button
                      title="Send code"
                      loading={requestEmailMutation.isPending}
                      disabled={!newEmail.trim()}
                      onPress={() => {
                        setEmailError(null);
                        requestEmailMutation.mutate();
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.otpInfo}>We sent a 6-digit code to {newEmail}.</Text>
                  <TextField
                    label="Verification code"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={emailCode}
                    onChangeText={setEmailCode}
                  />
                  {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  <View style={styles.inlineActions}>
                    <Button title="Back" variant="ghost" onPress={() => setEmailStep('form')} />
                    <Button
                      title="Confirm"
                      loading={verifyEmailMutation.isPending}
                      disabled={emailCode.length !== 6}
                      onPress={() => {
                        setEmailError(null);
                        verifyEmailMutation.mutate();
                      }}
                    />
                  </View>
                </>
              )}
            </View>
          )}

          {phoneStep === 'closed' ? (
            <Pressable style={styles.linkRow} onPress={() => setPhoneStep('form')}>
              <Text style={styles.linkLabel}>Change phone number</Text>
              <Text style={styles.linkValue}>{user?.phone}</Text>
            </Pressable>
          ) : (
            <View style={styles.inlineForm}>
              {phoneStep === 'form' ? (
                <>
                  <TextField
                    label="New phone number"
                    keyboardType="phone-pad"
                    value={newPhone}
                    onChangeText={setNewPhone}
                  />
                  {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                  <View style={styles.inlineActions}>
                    <Button title="Cancel" variant="ghost" onPress={() => setPhoneStep('closed')} />
                    <Button
                      title="Send code"
                      loading={requestPhoneMutation.isPending}
                      disabled={!newPhone.trim()}
                      onPress={() => {
                        setPhoneError(null);
                        requestPhoneMutation.mutate();
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.otpInfo}>We sent a 6-digit code to {newPhone}.</Text>
                  <TextField
                    label="Verification code"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={phoneCode}
                    onChangeText={setPhoneCode}
                  />
                  {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                  <View style={styles.inlineActions}>
                    <Button title="Back" variant="ghost" onPress={() => setPhoneStep('form')} />
                    <Button
                      title="Confirm"
                      loading={verifyPhoneMutation.isPending}
                      disabled={phoneCode.length !== 6}
                      onPress={() => {
                        setPhoneError(null);
                        verifyPhoneMutation.mutate();
                      }}
                    />
                  </View>
                </>
              )}
            </View>
          )}

          <Pressable style={styles.dangerRow} onPress={confirmDelete}>
            <Text style={styles.dangerLabel}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete account'}
            </Text>
          </Pressable>
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
  content: { padding: 20, gap: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.light.muted, marginBottom: 6 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  toggleText: { flex: 1, paddingRight: 12 },
  toggleLabel: { fontSize: 15, color: Colors.light.text },
  toggleHint: { fontSize: 12, color: Colors.light.muted, marginTop: 2 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  linkLabel: { fontSize: 15, color: Colors.light.text },
  linkValue: { fontSize: 13, color: Colors.light.muted },
  inlineForm: {
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.light.border,
  },
  inlineActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  otpInfo: { fontSize: 13, color: Colors.light.text, lineHeight: 18 },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
  dangerRow: { paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  dangerLabel: { fontSize: 14, fontWeight: '600', color: Colors.light.destructive },
});
