/** Notification center API calls (backend modules/notification) — the same
 * endpoints the mobile app uses; here they back the owner dashboard. */
import { api } from "@/services/api";
import type { Page } from "@/types";

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

export function listMyNotifications(pageSize = 50): Promise<NotificationPage> {
  return api.get<NotificationPage>(`/notifications?page_size=${pageSize}`);
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return api.patch<AppNotification>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<null> {
  return api.post<null>("/notifications/read-all");
}
