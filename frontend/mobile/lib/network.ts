/**
 * Whether the phone has a connection (NetInfo), and what the app does about it (arena-hub-player-app-states.html):
 *  - offline: a dark banner under the top of the screen; what was loaded stays (React Query keeps its data); actions that
 *    need the server say so on their button;
 *  - back online: a lime "Back online. Updating…" banner for about 2 seconds and the active screens load again.
 * "Online" means connected and, when the phone can tell, the internet reachable.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { queryClient } from '@/lib/query-client';

export type NetPhase = 'online' | 'offline' | 'back';

interface NetworkState {
  online: boolean;
  /** How many "No connection." screens are showing (a screen with nothing saved). The banner then says only "You are offline." */
  emptyScreens: number;
  addEmpty: (by: number) => void;
  /** offline, then "back" for BACK_BANNER_MS after the connection returns, then online. */
  phase: NetPhase;
  set: (online: boolean) => void;
}

export const BACK_BANNER_MS = 2000;
let backTimer: ReturnType<typeof setTimeout> | null = null;

export const useNetwork = create<NetworkState>()((set, get) => ({
  online: true,
  emptyScreens: 0,
  addEmpty: (by) => set((s) => ({ emptyScreens: Math.max(0, s.emptyScreens + by) })),
  phase: 'online',
  set: (online) => {
    const was = get().online;
    if (online === was) return;
    if (backTimer) clearTimeout(backTimer);
    if (!online) {
      set({ online: false, phase: 'offline' });
      return;
    }
    set({ online: true, phase: 'back' });
    // the screens that are open load again; what is not open loads when it is opened
    void queryClient.refetchQueries({ type: 'active' });
    backTimer = setTimeout(() => set({ phase: 'online' }), BACK_BANNER_MS);
  },
}));

export const isOnlineState = (s: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean =>
  s.isConnected !== false && s.isInternetReachable !== false;

let started = false;
/** Start listening once (the root layout calls this). */
export function startNetworkWatcher(): () => void {
  if (started) return () => {};
  started = true;
  const unsubscribe = NetInfo.addEventListener((s) => useNetwork.getState().set(isOnlineState(s)));
  // On the web NetInfo only watches the connection type, so the browser's own online/offline events are used as well
  // (this is also how the web build is tested).
  const win = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  const goOnline = () => useNetwork.getState().set(true);
  const goOffline = () => useNetwork.getState().set(false);
  if (win && Platform.OS === 'web') {
    win.addEventListener('online', goOnline);
    win.addEventListener('offline', goOffline);
  }
  return () => {
    unsubscribe();
    if (win && Platform.OS === 'web') {
      win.removeEventListener('online', goOnline);
      win.removeEventListener('offline', goOffline);
    }
    started = false;
  };
}

/** The toast text for a tap on an action that needs a connection. */
export const OFFLINE_TOAST = 'No connection. Your change was not saved.';

/** The whole-screen state when a screen has nothing saved to show and the phone is offline (frame 02). */
export const OFFLINE_TITLE = 'No connection.';
export const OFFLINE_TEXT = 'Connect to Wi-Fi or mobile data. We will load this for you when you are back online.';

/** Mark that this screen shows "No connection." (nothing saved) while it is mounted and offline. */
export function useOfflineEmpty(offline: boolean): void {
  const addEmpty = useNetwork((s) => s.addEmpty);
  useEffect(() => {
    if (!offline) return;
    addEmpty(1);
    return () => addEmpty(-1);
  }, [offline, addEmpty]);
}
