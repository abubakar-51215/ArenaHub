/**
 * Auth session store (Zustand + localStorage persistence).
 *
 * Holds the JWT pair and the current user. The API client reads/refreshes
 * tokens through this store; the owner layout guards on `user.role`.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Tokens, User } from "@/types";

// A non-sensitive cookie mirroring the signed-in user's role — NOT the JWT
// itself (that stays in localStorage; the API remains the real authorization
// boundary). This only lets edge middleware bounce obviously-unauthenticated
// visitors away from /owner and /admin before the client bundle loads,
// closing the "flash of protected shell" gap. Forging this cookie gains
// nothing: every API call still requires a valid Bearer JWT.
function setRoleCookie(role: string | null) {
  if (typeof document === "undefined") return;
  if (role) {
    document.cookie = `session_role=${role}; path=/; max-age=2592000; samesite=lax`;
  } else {
    document.cookie = "session_role=; path=/; max-age=0; samesite=lax";
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  /** True once the persisted state has rehydrated on the client. */
  hydrated: boolean;
  setSession: (tokens: Tokens, user: User) => void;
  setTokens: (tokens: Tokens) => void;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: (tokens, user) => {
        setRoleCookie(user.role);
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
        });
      },
      setTokens: (tokens) =>
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
      setUser: (user) => {
        setRoleCookie(user.role);
        set({ user });
      },
      clear: () => {
        setRoleCookie(null);
        set({ accessToken: null, refreshToken: null, user: null });
      },
    }),
    {
      name: "arenahub-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      // Next.js prerenders "use client" pages once at build time in Node.js
      // (no `window`/localStorage). Persist's default behavior auto-runs
      // hydrate() the instant the store module is created, so that build-time
      // pass consumes it in an environment with no storage — the store never
      // gets a real client-side rehydration afterward, and `hydrated` stays
      // false forever in the browser. skipHydration + an explicit rehydrate()
      // call from a client-only effect (components/providers.tsx) avoids this.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);
