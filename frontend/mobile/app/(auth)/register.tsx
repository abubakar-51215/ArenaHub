import { useMutation } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { register } from '@/services/auth';

export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      register({ full_name: fullName.trim(), email: email.trim(), phone: phone.trim(), password }),
    onSuccess: (result) => {
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { email: result.user.email, sentTo: result.otp_sent_to },
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setError(err.fieldErrors.map((f) => f.message).join('\n'));
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join ArenaHub and start booking courts</Text>

        <View style={styles.form}>
          <TextField label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Ali Raza" />
          <TextField
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <TextField
            label="Phone"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholder="03001234567"
          />
          <TextField
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Sign Up"
            loading={mutation.isPending}
            onPress={() => {
              setError(null);
              mutation.mutate();
            }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" style={styles.footerLink}>
            Log In
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 24 },
  form: { gap: 14 },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { color: Colors.light.muted, fontSize: 14 },
  footerLink: { color: Colors.light.tint, fontSize: 14, fontWeight: '700' },
});
