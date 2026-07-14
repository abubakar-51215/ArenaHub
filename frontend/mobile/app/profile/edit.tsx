import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Colors } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { updateProfile } from '@/services/auth';
import { uploadImage } from '@/services/uploads';
import { useAuthStore } from '@/store/auth';
import { ARENA_CITIES } from '@/types';

const SPORTS = ['futsal', 'cricket', 'padel', 'badminton', 'tennis'];

export default function EditProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [sports, setSports] = useState<string[]>(user?.preferred_sports ?? []);
  const [locations, setLocations] = useState<string[]>(user?.preferred_locations ?? []);
  // A freshly-picked local image URI, not yet uploaded — uploaded on save.
  const [pickedAvatarUri, setPickedAvatarUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatarPreview = pickedAvatarUri ?? user?.profile_picture ?? null;

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedAvatarUri(result.assets[0].uri);
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const profilePicture = pickedAvatarUri
        ? await uploadImage(pickedAvatarUri, 'avatars')
        : undefined;
      return updateProfile({
        full_name: fullName.trim(),
        bio: bio.trim() || null,
        preferred_sports: sports,
        preferred_locations: locations,
        ...(profilePicture !== undefined ? { profile_picture: profilePicture } : {}),
      });
    },
    onSuccess: (updated) => {
      setUser(updated);
      router.back();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Something went wrong.'),
  });

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.light.text} />
          </Pressable>
          <Text style={styles.title}>Personal Information</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatarSection}>
            <Pressable onPress={pickAvatar}>
              {avatarPreview ? (
                <Image source={{ uri: avatarPreview }} style={styles.avatarImage} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {user?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </Pressable>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          <TextField label="Full Name" value={fullName} onChangeText={setFullName} />
          <TextField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            multiline
            numberOfLines={3}
            style={{ height: 80, textAlignVertical: 'top' }}
          />

          <Text style={styles.sectionLabel}>Preferred Sports</Text>
          <View style={styles.chipRow}>
            {SPORTS.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, sports.includes(s) && styles.chipActive]}
                onPress={() => toggle(sports, setSports, s)}>
                <Text style={[styles.chipText, sports.includes(s) && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Preferred Cities</Text>
          <View style={styles.chipRow}>
            {ARENA_CITIES.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, locations.includes(c) && styles.chipActive]}
                onPress={() => toggle(locations, setLocations, c)}>
                <Text style={[styles.chipText, locations.includes(c) && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title="Save Changes"
            loading={mutation.isPending}
            onPress={() => {
              setError(null);
              mutation.mutate();
            }}
          />
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  avatarSection: { alignItems: 'center', gap: 6, marginBottom: 6 },
  avatarImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.light.card },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 32, fontWeight: '700', color: '#fff' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.light.tint,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHint: { fontSize: 12, color: Colors.light.muted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  content: { padding: 20, gap: 14 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.light.text, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: Colors.light.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipActive: { backgroundColor: Colors.light.tint, borderColor: Colors.light.tint },
  chipText: { fontSize: 13, color: Colors.light.text, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  errorText: { color: Colors.light.destructive, fontSize: 13 },
});
