/**
 * Opens the booking, match or admin screen a push notification is about when it is tapped — cold start
 * (the app was launched from the notification), background, and foreground alike. The event -> route
 * mapping is the same allowlist the in-app notification lists use (lib/push-navigation.ts); an unknown
 * event or missing id falls back to the notification list instead of guessing a path.
 */
import { router, type Href } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { loadNotifications, pushAvailable } from '@/lib/push';
import { resolvePushPath } from '@/lib/push-navigation';
import { useAuthStore } from '@/store/auth';

// Module-level so both the cold-start check and the live listener, which can both fire for the same
// tap, never open the same notification's target twice.
let lastHandledId: string | null = null;

export function usePushNavigation(sessionReady: boolean) {
  const pendingRef = useRef<string | null>(null);
  const readyRef = useRef(sessionReady);
  readyRef.current = sessionReady;

  // Replay a target that arrived before the app had finished loading the saved sign-in.
  useEffect(() => {
    if (sessionReady && pendingRef.current) {
      const dest = pendingRef.current;
      pendingRef.current = null;
      setTimeout(() => router.push(dest as Href), 350);
    }
  }, [sessionReady]);

  useEffect(() => {
    if (!pushAvailable) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;

    async function handle(response: NotificationResponse) {
      const id = response.notification.request.identifier;
      if (id === lastHandledId) return;
      lastHandledId = id;

      const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
      const event = typeof data.event === 'string' ? data.event : '';
      if (!event) return; // nothing to safely act on

      const { accessToken, user } = useAuthStore.getState();
      if (!accessToken || !user) return; // signed out: no safe screen to open

      const path = await resolvePushPath(event, data, user.role).catch(() => null);
      const dest = path ?? (user.role === 'admin' ? '/admin/notifications' : '/notifications');
      if (readyRef.current) router.push(dest as Href);
      else pendingRef.current = dest;
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handle(response);
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => void handle(response));
    return () => sub.remove();
  }, []);
}
