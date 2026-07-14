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
import { fetchMe, login } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((s) => s.setSession);

  const mutation = useMutation({
    mutationFn: async () => {
      const tokens = await login(email.trim(), password);
      // Stash the token immediately so the fetchMe call below is authed.
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      return { tokens, me };
    },
    onSuccess: ({ tokens, me }) => {
      setSession(tokens, me);
      router.replace('/(tabs)');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    },
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>
          <Text style={{ color: Colors.light.tint }}>Arena</Text>Hub
        </Text>
        <Text style={styles.title}>Welcome back!</Text>
        <Text style={styles.subtitle}>Login to continue booking</Text>

        <View style={styles.form}>
          <TextField
            label="Email or Phone"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <TextField
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <Link href="/(auth)/forgot-password" style={styles.forgot}>
            Forgot?
          </Link>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Log In"
            loading={mutation.isPending}
            onPress={() => {
              setError(null);
              mutation.mutate();
            }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don&apos;t have an account? </Text>
          <Link href="/(auth)/register" style={styles.footerLink}>
            Sign up
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#fff' },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  logo: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: Colors.light.text },
  subtitle: { fontSize: 14, color: Colors.light.muted, marginTop: 4, marginBottom: 24 },
  form: { gap: 14 },
  forgot: { alignSelf: 'flex-end', color: Colors.light.tint, fontSize: 13, fontWeight: '600' },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { color: Colors.light.muted, fontSize: 14 },
  footerLink: { color: Colors.light.tint, fontSize: 14, fontWeight: '700' },
});
