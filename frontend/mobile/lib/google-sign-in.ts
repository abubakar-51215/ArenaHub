/* eslint-disable @typescript-eslint/no-require-imports */
import { NativeModules, Platform } from 'react-native';

import { clearDevFailure, noteDevFailure } from '@/lib/dev-detail';
import { isExpoGo } from '@/lib/expo-go';

// Continue with Google (players only). The native Google sign-in library works only in a development or store
// build: it is not in Expo Go or the web build. Expo Go uses the browser OAuth fallback in google-button.tsx.
// The native library is loaded here, lazily, only where it can work, and only
// when the OAuth client ids were given to the build (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, and on iOS also
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). No id is written in the code; see docs/BEFORE_GOING_LIVE.md.
// The phone only passes Google's ID token to the server, which checks it with Google's own library.

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

export const googleAvailable =
  !isExpoGo &&
  Platform.OS !== 'web' &&
  !!NativeModules.RNGoogleSignin &&
  !!WEB_CLIENT_ID &&
  (Platform.OS !== 'ios' || !!IOS_CLIENT_ID);

export const GOOGLE_NOT_AVAILABLE = 'Google sign-in is not available yet.';
export const GOOGLE_FAILED = 'We could not sign you in with Google. Try again.';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let cached: GoogleModule | null | undefined;
let configured = false;

function load(): GoogleModule | null {
  if (!googleAvailable) return null;
  if (cached === undefined) {
    try {
      cached = require('@react-native-google-signin/google-signin') as GoogleModule;
    } catch {
      cached = null;
    }
  }
  if (cached && !configured) {
    cached.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID || undefined });
    configured = true;
  }
  return cached;
}

export type GoogleResult =
  | { kind: 'token'; idToken: string }
  | { kind: 'cancelled' }
  | { kind: 'not-available' }
  | { kind: 'failed' };

/** Open Google's account picker and return the ID token. Cancelling is not an error (the screen shows nothing). */
export async function getGoogleIdToken(): Promise<GoogleResult> {
  const G = load();
  if (!G) return { kind: 'not-available' };
  clearDevFailure('native:google');
  try {
    await G.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await G.GoogleSignin.signIn();
    if (G.isCancelledResponse(res)) return { kind: 'cancelled' };
    const idToken = res.data.idToken;
    // the picker shows again next time, so "Use a different account" can choose another one
    await G.GoogleSignin.signOut().catch(() => undefined);
    if (!idToken) noteDevFailure('native:google', { code: 'no-id-token' });
    return idToken ? { kind: 'token', idToken } : { kind: 'failed' };
  } catch (err) {
    if (G.isErrorWithCode(err)) {
      if (err.code === G.statusCodes.SIGN_IN_CANCELLED || err.code === G.statusCodes.IN_PROGRESS) return { kind: 'cancelled' };
      noteDevFailure('native:google', { code: err.code }); // development build only; '10' is DEVELOPER_ERROR
      if (err.code === G.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { kind: 'failed' };
    } else {
      noteDevFailure('native:google', err);
    }
    return { kind: 'failed' };
  }
}
