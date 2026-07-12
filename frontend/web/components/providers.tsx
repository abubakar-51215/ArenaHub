"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { makeQueryClient } from "@/lib/query-client";

/** Client-side providers wrapped around the whole app in the root layout. */
export function Providers({ children }: { children: React.ReactNode }) {
  // useState keeps one client per browser session without sharing it across
  // server requests (the recommended App Router pattern).
  const [queryClient] = useState(makeQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
