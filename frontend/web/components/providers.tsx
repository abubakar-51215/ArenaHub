"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { makeQueryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";

/** Client-side providers wrapped around the whole app in the root layout. */
export function Providers({ children }: { children: React.ReactNode }) {
  // useState keeps one client per browser session without sharing it across
  // server requests (the recommended App Router pattern).
  const [queryClient] = useState(makeQueryClient);

  // The auth store uses persist({ skipHydration: true }) — rehydrate exactly
  // once here, guaranteed to run only in the browser (never during Next.js's
  // build-time prerender of "use client" pages).
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
