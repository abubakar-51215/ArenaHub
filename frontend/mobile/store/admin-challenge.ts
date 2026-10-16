import { create } from 'zustand';

/**
 * The admin sign-in step in progress: the challenge token the server gave
 * after the right password, and the masked address the code went to. Memory only, on
 * purpose: it is never written to SecureStore or localStorage, so closing the
 * app ends the sign-in and the admin starts again at Log in.
 */
interface AdminChallengeState {
  challengeToken: string | null;
  /** The masked address from the server ("a***@arenahub.pk"). */
  sentTo: string | null;
  /** false when the first code could not be sent. */
  codeSent: boolean;
  set: (challengeToken: string, sentTo: string, codeSent: boolean) => void;
  clear: () => void;
}

export const useAdminChallenge = create<AdminChallengeState>()((set) => ({
  challengeToken: null,
  sentTo: null,
  codeSent: true,
  set: (challengeToken, sentTo, codeSent) => set({ challengeToken, sentTo, codeSent }),
  clear: () => set({ challengeToken: null, sentTo: null, codeSent: true }),
}));

/** "admin@arenahub.pk" -> "a***@arenahub.pk" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return domain ? `${local.slice(0, 1)}***@${domain}` : email;
}
