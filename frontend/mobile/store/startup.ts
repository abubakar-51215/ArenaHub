import { create } from 'zustand';

/** What Log in needs to know about the start-up check of a saved sign-in. */
interface StartupState {
  /** The saved sign-in could not be checked because the server could not be reached. */
  unreachable: boolean;
  /** A new check is running (after "Try again"). */
  checking: boolean;
  /** Runs the check again; set by the root layout. */
  retry: (() => void) | null;
  set: (patch: Partial<Pick<StartupState, 'unreachable' | 'checking' | 'retry'>>) => void;
}

export const useStartup = create<StartupState>()((set) => ({
  unreachable: false,
  checking: false,
  retry: null,
  set: (patch) => set(patch),
}));
