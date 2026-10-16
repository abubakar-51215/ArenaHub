import { useCodeEntry } from '@/components/auth/use-code-entry';

/**
 * The "enter the 6-digit code we sent" part of the phone, email and password changes: the same code entry as
 * sign-up and sign-in (see useCodeEntry). The screen says what to do with a good code.
 */
export function useCodeStep({
  onVerify,
  onResend,
  sentTo,
}: {
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<unknown>;
  sentTo?: string;
}) {
  return useCodeEntry({ onVerify, onResend, sentTo });
}
