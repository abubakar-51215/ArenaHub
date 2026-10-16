import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { showToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { GOOGLE_FAILED, GOOGLE_NOT_AVAILABLE, getGoogleIdToken } from '@/lib/google-sign-in';
import { googleSignIn } from '@/services/auth';
import { useAuthStore } from '@/store/auth';

// Continue with Google (arena-hub-player-app-google.html, frames 1 to 12). Players only: the server refuses owners
// and admins ("This account must log in with email and password.") and suspended accounts, and the screen shows those
// words in its own error box (frames 10 and 11). Google's window closed by the person: nothing is shown. Expo Go or
// no Google set-up: the toast "Google sign-in is not available yet." (frame 8). Anything else: "We could not sign you
// in with Google. Try again." (frame 9). While it works the button shows a spinner and the screen's other buttons wait
// (frame 2). Offline: "Google needs a connection" (frame 12).
const LOGO = require('@/assets/brand/google-g.png');

/** The Google sign-in of a screen. `onRefused` gets the server's words for a refused account. */
export function useGoogleSignIn(onRefused: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const got = await getGoogleIdToken();
      if (got.kind === 'cancelled') return;
      if (got.kind === 'not-available') return showToast(GOOGLE_NOT_AVAILABLE);
      if (got.kind === 'failed') return showToast(GOOGLE_FAILED);
      const res = await googleSignIn(got.idToken);
      setSession({ access_token: res.access_token, refresh_token: res.refresh_token, token_type: res.token_type }, res.user);
      // a new account without a phone opens "One more step" (the root layout keeps it there until it is saved)
      router.replace((res.phone_needed ? '/one-more-step' : '/(tabs)') as Href);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403) && err.message !== GOOGLE_FAILED) {
        onRefused(err.message); // "Your account has been suspended." / "This account must log in with email and password."
      } else if (err instanceof ApiError && err.status === 503) {
        showToast(GOOGLE_NOT_AVAILABLE);
      } else {
        showToast(GOOGLE_FAILED);
      }
    } finally {
      setBusy(false);
    }
  };
  return { start, busy };
}

export function GoogleButton({ title, busy, disabled, onPress }: { title: string; busy: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Button
      variant="ghost"
      haptic
      title={title}
      loading={busy}
      disabled={disabled}
      offlineLabel="Google needs a connection"
      onPress={onPress}
      // Google's own "G" (from Google's sign-in branding assets), never redrawn
      leading={<Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors />}
    />
  );
}

const styles = StyleSheet.create({
  logo: { width: 20, height: 20 },
});
