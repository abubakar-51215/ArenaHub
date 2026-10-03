/**
 * Auth session store (Zustand + expo-secure-store persistence).
 *
 * Holds the JWT pair and the current user. The API client reads/refreshes
 * tokens through this store. Mirrors frontend/web/store/auth.ts's shape and
 * actions; mobile persists to the device keychain/keystore instead of
 * localStorage, and doesn't need the `skipHydration` SSR workaround — Expo
 * has no server-render pass, so the default async rehydrate-on-mount just
 * works, with `hydrated` still exposed so screens can gate on it while
 * tokens load from SecureStore.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { Tokens, User } from '../types';

// expo-secure-store has no web implementation (there's no OS keychain in a
// browser) — fall back to localStorage there. Native (iOS/Android) always
// uses the device keychain/keystore.
const secureStorage: StateStorage =
  Platform.OS === 'web'
    ? {
        // Async on purpose: a sync read rehydrates inside create(), before
        // `useAuthStore` is assigned, so onRehydrateStorage below would hit it
        // uninitialised and `hydrated` would never become true. The window
        // guards cover Expo's static-export render pass, which runs in Node.
        getItem: async (name) => (typeof window === 'undefined' ? null : window.localStorage.getItem(name)),
        setItem: async (name, value) => {
          if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
        },
        removeItem: async (name) => {
          if (typeof window !== 'undefined') window.localStorage.removeItem(name);
        },
      }
    : {
        getItem: async (name) => (await SecureStore.getItemAsync(name)) ?? null,
        setItem: async (name, value) => {
          await SecureStore.setItemAsync(name, value);
        },
        removeItem: async (name) => {
          await SecureStore.deleteItemAsync(name);
        },
      };

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  /** True once the persisted state has rehydrated from SecureStore. */
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
      setSession: (tokens, user) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user,
        }),
      setTokens: (tokens) =>
        set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'arenahub-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hydrated: true });
      },
    },
  ),
);
