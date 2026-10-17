/* eslint-disable @typescript-eslint/no-require-imports */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/expo-go';
import { unregisterDeviceToken } from '@/services/notifications';

// expo-notifications is never loaded in Expo Go (its push part was removed in SDK 53, and even importing it logs an
// error there) nor on the web. It is loaded here, lazily, only where push can work: a real build on Android or iOS.
export const pushAvailable = !isExpoGo && Platform.OS !== 'web';

type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null | undefined;

export function loadNotifications(): NotificationsModule | null {
  if (!pushAvailable) return null;
  if (cached === undefined) {
    try {
      cached = require('expo-notifications') as NotificationsModule;
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** Show a banner and play a sound when a push arrives while the app is open. Does nothing in Expo Go. */
export function setupForegroundNotifications(): void {
  const N = loadNotifications();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

const UNREGISTER_TIMEOUT_MS = 4000;

/** This device's current Expo push token, only when permission is already granted (never prompts). */
async function currentExpoPushToken(): Promise<string | null> {
  if (!pushAvailable || !Device.isDevice) return null;
  const N = loadNotifications();
  if (!N) return null;
  const { status } = await N.getPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data } = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

/**
 * Tell the backend this device's push token no longer belongs to anyone signed in, on logout — so a
 * later sign-in by someone else on the same phone cannot still receive the previous account's pushes.
 * Best-effort and time-boxed: never throws, and never holds up the actual sign-out past a few seconds
 * (e.g. no network).
 */
export async function unregisterCurrentDevice(): Promise<void> {
  if (!pushAvailable) return;
  try {
    await Promise.race([
      (async () => {
        const token = await currentExpoPushToken();
        if (token) await unregisterDeviceToken(token, { timeoutMs: UNREGISTER_TIMEOUT_MS });
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS)),
    ]);
  } catch {
    // best-effort — a failed unregister just leaves a stale token row, cleaned up next successful login elsewhere
  }
}
