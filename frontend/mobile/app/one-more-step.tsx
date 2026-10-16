import { useMutation } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { FieldMessage } from '@/components/auth/field-message';
import { Button, useButtonStatus } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Text } from '@/components/ui/text';
import { Colors, Font } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { saveGooglePhone } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// "One more step" (arena-hub-player-app-google.html, frames 4 to 7): an account made with Google has no phone yet.
// The number follows the sign-up rules and the same words ("Phone number is already registered."); Continue turns
// dark when the number looks right and shows a spinner while it saves. "Use a different account" (and Back) signs out,
// so the Google picker can choose another account. The root layout keeps the person here until the number is saved.
export default function OneMoreStepScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [btnStatus, flash] = useButtonStatus();
  const valid = phone.replace(/\D/g, '').length >= 10;

  const save = useMutation({
    mutationFn: () => saveGooglePhone(phone.trim()),
    onSuccess: (saved) => {
      setUser(saved);
      router.replace('/(tabs)' as Href);
    },
    onError: (err) => {
      flash('error');
      if (err instanceof ApiError) {
        const field = err.fieldErrors.find((f) => f.field.endsWith('phone'));
        setError(field ? 'Enter a valid phone number.' : err.message);
      } else setError('Could not reach the server. Check your connection and try again.');
    },
  });

  const differentAccount = () => useAuthStore.getState().clear();

  if (!user) return null;
  const initial = (user.full_name.trim()[0] ?? user.email[0] ?? '?').toUpperCase();

  return (
    <AuthScreen
      title="One more step"
      subtitle="Add your phone number so arenas can reach you about your bookings."
      onBack={save.isPending ? () => undefined : differentAccount}>
      <View style={styles.form}>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.who}>
            <Text style={styles.name} numberOfLines={1}>
              {user.full_name}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
          </View>
        </View>
        <View style={styles.group}>
          <Field
            placeholder="Phone number"
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              setError(null);
            }}
            error={!!error}
            autoComplete="tel"
            textContentType="telephoneNumber"
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={() => valid && !save.isPending && save.mutate()}
            accessibilityLabel="Phone number"
            autoFocus
          />
          {error ? <FieldMessage>{error}</FieldMessage> : null}
        </View>
        <Button
          title="Continue"
          disabled={!valid}
          loading={save.isPending}
          status={btnStatus}
          offlineLabel="Continue needs a connection"
          onPress={() => save.mutate()}
        />
        {save.isPending ? null : (
          <Pressable onPress={differentAccount} accessibilityRole="button" accessibilityLabel="Use a different account" style={styles.linkRow}>
            <Text style={styles.link}>Use a different account</Text>
          </Pressable>
        )}
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 11 },
  group: { gap: 6 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: Colors.light.card,
    borderColor: Colors.light.line,
    borderWidth: 1,
    borderRadius: 15,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: Font.bodyBold, color: Colors.light.lime },
  who: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: Font.bodyBold, color: Colors.light.text },
  email: { fontSize: 14, color: Colors.light.muted },
  linkRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 14, fontFamily: Font.bodyBold, color: Colors.light.text },
});
