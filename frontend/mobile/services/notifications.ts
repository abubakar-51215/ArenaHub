/** Notification center + push device registration API calls. */
import { api } from "../lib/api";
import type { Page } from "../types";

export interface AppNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type NotificationPage = Page<AppNotification> & { unread_count: number };

export function listMyNotifications(): Promise<NotificationPage> {
  return api.get<NotificationPage>("/notifications?page_size=50");
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return api.patch<AppNotification>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<null> {
  return api.post<null>("/notifications/read-all");
}

export function registerDeviceToken(
  token: string,
  platform: "android" | "ios",
): Promise<null> {
  return api.post<null>("/notifications/devices", { token, platform });
}

export function unregisterDeviceToken(token: string): Promise<null> {
  return api.del<null>(`/notifications/devices/${encodeURIComponent(token)}`);
}
