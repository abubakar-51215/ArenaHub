/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from 'react-native';

import { isExpoGo } from '@/lib/expo-go';

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
