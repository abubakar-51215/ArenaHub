import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { showToast } from '@/components/ui/toast';
import { getPhoneOverview } from '@/services/admin';
import { getUnreadCount } from '@/services/notifications';
import { useAuthStore } from '@/store/auth';

/** Everything the admin screens cache lives under this key, so one call refreshes (or Log out clears) all of it. */
export const ADMIN_KEY = 'admin';

/** The Overview numbers; also the numbers on the Approvals and Complaints tabs. Refreshes every minute while open. */
export function useOverview() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  return useQuery({ queryKey: [ADMIN_KEY, 'overview'], queryFn: getPhoneOverview, enabled: isAdmin, refetchInterval: 60_000, retry: 1 });
}

/** Unread notices of the signed-in admin (the dot on the Overview bell). */
export function useAdminUnread() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  return useQuery({ queryKey: [ADMIN_KEY, 'unread'], queryFn: () => getUnreadCount(), enabled: isAdmin, refetchInterval: 60_000, retry: 1 });
}

/** The message to show when an admin action fails: someone else got there first (409) is an amber note. */
export function actionFailed(err: unknown, fallback: string, handledMessage?: string): 'handled' | 'failed' {
  if (err instanceof ApiError && err.status === 409 && handledMessage) {
    showToast(handledMessage, 'warn');
    return 'handled';
  }
  showToast(err instanceof ApiError ? err.message : fallback);
  return 'failed';
}
