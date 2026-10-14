import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { CodeBoxes } from '@/components/ui/code-boxes';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { Colors } from '@/constants/theme';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { useShake } from '@/hooks/use-shake';
import { ApiError } from '@/lib/api';
import { OFFLINE_TOAST, useNetwork } from '@/lib/network';

/** The server's words when the email could not go out (app/shared/codes.py). */
export const NOT_SENT_MESSAGE = 'We could not send the code. Tap Resend.';
const RESEND_WAIT = 60;

/**
 * Every "enter the 6-digit code we emailed" step on the phone (frames 3, 7 and 8 of
 * arena-hub-player-app-auth-2-fixed.html): six boxes (paste and the keyboard's code suggestion fill
 * them, see CodeBoxes), the code is sent at the sixth digit, a wrong code shakes the boxes once
 * (not with reduce motion) and shows the server's own message, "Send a new code in 0:42" (grey)
 * then "Send a new code", the server's "Wait N seconds ..." restarts the timer at N, and a code
 * that could not be sent can be asked for again at once. The screen owns its button: `confirm`,
 * `ready` and `loading` are for it.
 */
export function useCodeEntry({
  onVerify,
  onResend,
  sentTo,
  codeSent = true,
  onError,
  onResent,
}: {
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<unknown>;
  /** The masked address, for "New code sent to a***@gmail.com". */
  sentTo?: string;
  /** false when the first code could not be sent: the message shows and Resend is ready. */
  codeSent?: boolean;
  /** A screen-specific answer (an expired sign-in step, say); return true when handled. */
  onError?: (err: unknown) => boolean;
  /** After a new code went out (the reset screen goes back to its boxes). */
  onResent?: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(codeSent ? null : NOT_SENT_MESSAGE);
  const wait = useCountdown(RESEND_WAIT, codeSent);
  const { style: shakeStyle, shake } = useShake();
  const online = useNetwork((s) => s.online);
  const sending = useRef(false);
  const lastSent = useRef<string | null>(null);

  const verify = useMutation({
    mutationFn: (value: string) => onVerify(value),
    onSettled: () => {
      sending.current = false;
    },
    onError: (err) => {
      if (onError?.(err)) return;
      shake();
      setCode(''); // the boxes empty for the next try (the message stays)
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    },
  });

  const resend = useMutation({
    mutationFn: onResend,
    onSuccess: () => {
      setCode('');
      setError(null);
      lastSent.current = null;
      showToast(sentTo ? `New code sent to ${sentTo}` : 'New code sent');
      wait.restart();
      onResent?.();
    },
    onError: (err) => {
      if (onError?.(err)) return;
      if (err instanceof ApiError) {
        // "Wait N seconds before asking for another code." restarts the timer at N
        const waitFor = /Wait (\d+) seconds/.exec(err.message);
        if (waitFor) wait.restart(Number(waitFor[1]));
        // a code that could not be sent may be asked for again at once
        if (err.status === 503) wait.restart(0);
        setError(err.message);
        return;
      }
      setError('Could not send a new code. Check your connection.');
    },
  });

  const send = (value: string, auto = false) => {
    if (value.length < 6 || sending.current) return;
    if (auto && value === lastSent.current) return; // the same six digits are never sent twice by themselves
    lastSent.current = value;
    sending.current = true;
    setError(null);
    verify.mutate(value);
  };
  const confirm = () => send(code);

  const askAgain = () => {
    if (resend.isPending) return;
    if (!online) {
      showToast(OFFLINE_TOAST);
      return;
    }
    resend.mutate();
  };

  const boxes = (
    <View style={styles.wrap}>
      <Animated.View style={shakeStyle}>
        <CodeBoxes
          value={code}
          onChange={(c) => {
            setCode(c);
            setError(null);
            if (c.length === 6) send(c, true); // sent at the sixth digit (typed, pasted or suggested)
          }}
          error={!!error && error !== NOT_SENT_MESSAGE}
          autoFocus
          onSubmit={confirm}
        />
      </Animated.View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
  const resendLink = wait.running ? (
    <View style={styles.resendPress}>
      <Text style={styles.resend}>
        Send a new code in <Text style={styles.strong}>{formatCountdown(wait.remaining)}</Text>
      </Text>
    </View>
  ) : (
    <Pressable onPress={askAgain} disabled={resend.isPending} accessibilityRole="button" accessibilityLabel="Send a new code" style={styles.resendPress}>
      <Text style={styles.resend}>{resend.isPending ? 'Sending…' : <Text style={styles.strong}>Send a new code</Text>}</Text>
    </Pressable>
  );
  // `view` is the boxes with the link under them; a screen with its button between the two (frames 3 and 7) uses
  // `boxes` and `resendLink` on their own.
  const view = (
    <View style={styles.wrap}>
      {boxes}
      {resendLink}
    </View>
  );
  return {
    view,
    boxes,
    resendLink,
    confirm,
    ready: code.length === 6,
    loading: verify.isPending,
    code,
    // for a screen with its own "Send a new code" button (the reset screen's failed frame)
    askAgain,
    error,
    waiting: wait.running,
    remaining: wait.remaining,
    resending: resend.isPending,
  };
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  strong: { fontWeight: '700', color: Colors.light.text },
  error: { fontSize: 14, lineHeight: 20, color: Colors.light.redText },
  resend: { fontSize: 14, color: Colors.light.muted, textAlign: 'center' },
  resendPress: { minHeight: 44, justifyContent: 'center' },
});
