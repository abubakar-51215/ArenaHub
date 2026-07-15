/**
 * Registers this device for push notifications once the player is signed
 * in: requests permission, fetches an Expo push token, and registers it
 * with the backend (app/modules/notification). Delivery goes out through
 * the Expo Push service, which fans out to FCM/APNs — no native Firebase
 * setup needed since this is a managed Expo app.
 *
 * Best-effort: a denied permission or a missing physical device (simulator)
 * just skips registration silently, it never blocks navigation/login.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { registerDeviceToken } from "@/services/notifications";

export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !Device.isDevice) return;

    let cancelled = false;

    async function register() {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== "granted" || cancelled) return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      if (cancelled) return;

      try {
        await registerDeviceToken(
          token,
          Platform.OS === "ios" ? "ios" : "android",
        );
      } catch {
        // Best-effort — a failed registration just means no push this session.
      }
    }

    register();
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
