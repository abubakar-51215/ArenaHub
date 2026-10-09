import { useMutation } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput as RNTextInput } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { FieldMessage } from '@/components/auth/field-message';
import { PasswordRules, passwordMeetsRules } from '@/components/auth/password-rules';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { register } from '@/services/auth';

type Errors = Partial<Record<'full_name' | 'email' | 'phone' | 'password', string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Sign up variant choice unconfirmed": this is the one Sign up frame the
// prototype has (arena-hub-player-app-auth.html, "Sign up / default").
export default function RegisterScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const emailRef = useRef<RNTextInput>(null);
  const phoneRef = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);

  const clear = (key: keyof Errors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

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
      if (!(err instanceof ApiError)) {
        setFormError('Something went wrong. Try again.');
        return;
      }
      // field errors from the server (422), then the 409 "already registered" ones
      const next: Errors = {};
      for (const f of err.fieldErrors) {
        const key = f.field.split('.').pop() as keyof Errors;
        if (key in { full_name: 1, email: 1, phone: 1, password: 1 }) next[key] = f.message;
      }
      if (err.status === 409 && /email/i.test(err.message)) next.email = err.message;
      else if (err.status === 409 && /phone/i.test(err.message)) next.phone = err.message;
      else if (/password/i.test(err.message)) next.password = err.message;
      if (Object.values(next).some(Boolean)) setErrors(next);
      else setFormError(err.message);
    },
  });

  const submit = () => {
    if (mutation.isPending) return;
    setFormError(null);
    const next: Errors = {};
    if (!fullName.trim()) next.full_name = 'Enter your full name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (phone.replace(/\D/g, '').length < 10) next.phone = 'Enter a valid phone number.';
    if (!passwordMeetsRules(password)) next.password = 'Your password needs every rule below.';
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  };

  return (
    <AuthScreen title="Create your account" subtitle="Join ArenaHub and start booking courts.">
      <View style={styles.form}>
        <View style={styles.group}>
          <Field
            icon={<Icon name="user" size={15} color={Colors.light.muted} />}
            placeholder="Full name"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              clear('full_name');
            }}
            error={!!errors.full_name}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            accessibilityLabel="Full name"
          />
          {errors.full_name ? <FieldMessage>{errors.full_name}</FieldMessage> : null}
        </View>
        <View style={styles.group}>
          <Field
            ref={emailRef}
            icon={<Icon name="mail" size={15} color={Colors.light.muted} />}
            placeholder="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              clear('email');
            }}
            error={!!errors.email}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            accessibilityLabel="Email"
          />
          {errors.email ? <FieldMessage>{errors.email}</FieldMessage> : null}
        </View>
        <View style={styles.group}>
          <Field
            ref={phoneRef}
            placeholder="Phone (e.g. 03XX XXXXXXX)"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              clear('phone');
            }}
            error={!!errors.phone}
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="Phone"
          />
          {errors.phone ? <FieldMessage>{errors.phone}</FieldMessage> : null}
        </View>
        <View style={styles.group}>
          <Field
            ref={passwordRef}
            icon={<Icon name="lock" size={15} color={Colors.light.muted} />}
            placeholder="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              clear('password');
            }}
            error={!!errors.password}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submit}
            accessibilityLabel="Password"
          />
          {errors.password ? <FieldMessage>{errors.password}</FieldMessage> : null}
        </View>
        <PasswordRules password={password} />
        {formError ? <FieldMessage>{formError}</FieldMessage> : null}
        <View style={styles.button}>
          <Button title="Create account" loading={mutation.isPending} onPress={submit} />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <Link href="/(auth)/login" style={styles.footerLink} accessibilityRole="link">
          Log in
        </Link>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  group: { gap: 6 },
  button: { marginTop: 6 },
  // "Already have an account? Log in": 12px, centred, 18px under the button;
  // the row is 44 tall so the link is easy to hit
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44,
    marginTop: 8,
  },
  footerText: { fontSize: 12, color: Colors.light.muted },
  footerLink: { fontSize: 12, fontWeight: '700', color: Colors.light.text, paddingVertical: 14 },
});
