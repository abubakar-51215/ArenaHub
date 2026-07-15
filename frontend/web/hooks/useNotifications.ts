/** TanStack Query hooks for the notification center. The list refetches on
 * an interval so the sidebar's unread badge stays current without websockets. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";

export function useNotifications() {
  return useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listMyNotifications(),
    refetchInterval: 60_000,
  });
}

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-notifications"] });
  const markRead = useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate });
  const markAllRead = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });
  return { markRead, markAllRead };
}
