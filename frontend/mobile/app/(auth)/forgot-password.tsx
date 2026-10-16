import { useMutation } from '@tanstack/react-query';
import { Link, router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { FieldMessage } from '@/components/auth/field-message';
import { Button, useButtonStatus } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { BodyLetterSpacing, Colors, Font } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { forgotPassword } from '@/services/auth';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Frame 2 of arena-hub-player-app-auth-2-fixed.html. The server answers the same
// way whether or not the email has an account, so this screen always goes on
// to the code step, and says "if an account exists" there.
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();

  const mutation = useMutation({
    mutationFn: () => forgotPassword(email.trim()),
    onSuccess: () => {
      router.push({ pathname: '/(auth)/reset-password', params: { email: email.trim() } } as Href);
    },
    onError: (err) => {
      flash('error');
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Please wait a minute and try again.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    },
  });

  const submit = () => {
    if (mutation.isPending) return;
    setError(null);
    if (!EMAIL.test(email.trim())) {
      setError('Enter a valid email address.');
      flash('error');
      return;
    }
    mutation.mutate();
  };

  return (
    <AuthScreen showMark title="Forgot password?" subtitle="Enter your email. We will send a 6-digit code if an account exists.">
      <View style={styles.form}>
        <Field
          icon="mail"
          placeholder="Email"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          error={!!error}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabel="Email"
        />
        {error ? <FieldMessage>{error}</FieldMessage> : null}
        <Button title="Send reset code" loading={mutation.isPending} status={btnStatus} onPress={submit} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Remembered it? </Text>
        <Link href="/(auth)/login" dismissTo style={styles.footerLink} accessibilityRole="link">
          Log in
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 11 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44, marginTop: 4 },
  footerText: { fontSize: 14, color: Colors.light.muted },
  footerLink: { fontSize: 14, fontFamily: Font.bodyBold, letterSpacing: BodyLetterSpacing, color: Colors.light.text, paddingVertical: 14, paddingHorizontal: 6 },
});
