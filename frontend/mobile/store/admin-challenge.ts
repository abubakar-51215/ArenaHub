import { create } from 'zustand';

/**
 * The admin sign-in step in progress: the challenge token the server gave
 * after the right password, and the email it was sent to. Memory only, on
 * purpose: it is never written to SecureStore or localStorage, so closing the
 * app ends the sign-in and the admin starts again at Log in.
 */
interface AdminChallengeState {
  challengeToken: string | null;
  email: string | null;
  set: (challengeToken: string, email: string) => void;
  clear: () => void;
}

export const useAdminChallenge = create<AdminChallengeState>()((set) => ({
  challengeToken: null,
  email: null,
  set: (challengeToken, email) => set({ challengeToken, email }),
  clear: () => set({ challengeToken: null, email: null }),
}));

/** "admin@arenahub.pk" -> "a***@arenahub.pk" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : email;
}
