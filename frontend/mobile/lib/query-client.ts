import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

/** Shared TanStack Query client for server-state caching across the app. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// React Native has no window focus: tell React Query when the app comes back to the front, so lists that went stale while
// the phone was in a pocket (bookings, notifications) refresh by themselves.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}
