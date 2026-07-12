import { QueryClient } from "@tanstack/react-query";

/** Shared TanStack Query client for server-state caching across the app. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
      },
    },
  });
}
