/**
 * Recent search queries (FR-P-04: "store recent search queries for quick
 * repeat searches"). Client-side only — search terms are personal-device
 * convenience data, not account data, so they live in AsyncStorage rather
 * than the backend. Most-recent-first, deduplicated, capped at 8.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_RECENT = 8;

interface SearchHistoryState {
  recent: string[];
  add: (query: string) => void;
  clear: () => void;
}

export const useSearchHistory = create<SearchHistoryState>()(
  persist(
    (set) => ({
      recent: [],
      add: (query) => {
        const trimmed = query.trim();
        if (trimmed.length < 2) return;
        set((state) => ({
          recent: [
            trimmed,
            ...state.recent.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
          ].slice(0, MAX_RECENT),
        }));
      },
      clear: () => set({ recent: [] }),
    }),
    { name: 'arenahub-search-history', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
