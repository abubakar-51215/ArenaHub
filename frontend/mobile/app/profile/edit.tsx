import { useMutation } from '@tanstack/react-query';
import { pickPhoto } from '@/lib/pick-photo';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FormScreen } from '@/components/g6/form-screen';
import { ArenaImage } from '@/components/ui/arena-image';
import { Button } from '@/components/ui/button';
import { IconExtra } from '@/components/ui/icon-extra';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import { updateProfile } from '@/services/auth';
import { photoProblem, uploadImage } from '@/services/uploads';
import { useAuthStore } from '@/store/auth';
import { ARENA_CITIES } from '@/types';

// Personal information, from arena-hub-player-app-account.html (frame 07): photo, name, city, phone and email. Phone and
// email change by a code sent to the new one (their own screens). The city is chosen from the four cities (chips, so every
// choice is a 44 px tap), and is the one Home uses when the phone's location is off.
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

export default function PersonalInformationScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [city, setCity] = useState<string | undefined>(user?.preferred_locations?.[0]);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = fullName.trim() !== (user?.full_name ?? '') || city !== user?.preferred_locations?.[0] || !!pickedUri;

  async function pick() {
    tapHaptic();
    const picked = await pickPhoto({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!picked) return;
    const problem = photoProblem(picked);
    if (problem) return showToast(problem.title);
    setPickedUri(picked.uri);
  }

  const save = useMutation({
    mutationFn: async () => {
      const picture = pickedUri ? await uploadImage(pickedUri, 'avatars') : undefined;
      const others = (user?.preferred_locations ?? []).filter((c) => c !== city);
      return updateProfile({
        full_name: fullName.trim(),
        ...(city ? { preferred_locations: [city, ...others] } : {}),
        ...(picture !== undefined ? { profile_picture: picture } : {}),
      });
    },
    onSuccess: (updated) => {
      successHaptic();
      setUser(updated);
      showToast('Saved');
      router.back();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.'),
  });

  const submit = () => {
    if (save.isPending) return;
    if (!fullName.trim()) return setError('Enter your name.');
    setError(null);
    save.mutate();
  };

  const go = (path: string) => router.push(path as unknown as Href);

  return (
    <FormScreen title="Personal information" footer={<Button title="Save changes" loading={save.isPending} disabled={!changed} onPress={submit} />}>
      <View style={styles.avatarWrap}>
        <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel="Change profile photo">
          <ArenaImage
            photo={pickedUri ?? user?.profile_picture}
            style={styles.avatar}
            fallback={
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text variant="archivo" style={styles.avatarText}>
                  {initials(fullName)}
                </Text>
              </View>
            }
          />
          <View style={styles.camera}>
            <IconExtra name="camera" size={16} color={Colors.light.ink} />
          </View>
        </Pressable>
      </View>

      <TextField label="Full name" kind="name" value={fullName} onChangeText={(t) => { setFullName(t); setError(null); }} error={error} onSubmit={submit} />

      <View style={{ gap: 6 }}>
        <Text style={styles.label}>City</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {ARENA_CITIES.map((c) => {
            const on = c === city;
            return (
              <Pressable key={c} onPress={() => setCity(c)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: Colors.light.lime }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField label="Phone" kind="phone" value={user?.phone ?? ''} editable={false} action={{ label: 'Change', onPress: () => go('/profile/change-phone') }} />
      <TextField label="Email" kind="email" value={user?.email ?? ''} editable={false} action={{ label: 'Change', onPress: () => go('/profile/change-email') }} />
      <Text style={styles.hint}>Changing your phone or email needs a code we send to the new one.</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', marginBottom: 4 },
  avatar: { width: 96, height: 96, borderRadius: 48, overflow: 'hidden' },
  avatarFallback: { backgroundColor: Colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontWeight: '700', color: Colors.light.lime },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.light.lime, borderWidth: 2, borderColor: Colors.light.paper, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: Colors.light.card, borderWidth: 1.5, borderColor: Colors.light.line, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: Colors.light.ink, borderColor: Colors.light.ink },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.light.text },
  hint: { fontSize: 14, lineHeight: 20, color: Colors.light.muted },
});
