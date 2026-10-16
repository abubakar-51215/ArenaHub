"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CodeBoxes } from "@/components/auth/code-boxes";
import { ApiError } from "@/services/api";
import { cn } from "@/lib/utils";

/** The server's words when the email could not go out (backend app/shared/codes.py). */
export const NOT_SENT_MESSAGE = "We could not send the code. Tap Resend.";
const RESEND_WAIT_S = 60;
const EMPTY_CODE = "      ";

/** 42 -> "0:42". */
export function formatWait(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A whole-second countdown that reads the clock, so a background tab shows the right time when it wakes. */
function useWait(startAt: number) {
  const endsAt = useRef(Date.now() + startAt * 1000);
  const [left, setLeft] = useState(startAt);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const restart = useCallback((from: number = RESEND_WAIT_S) => {
    endsAt.current = Date.now() + from * 1000;
    setLeft(from);
  }, []);
  return { left, restart };
}

/**
 * Every "enter the 6-digit code we emailed" step on the web (owner sign-up, admin sign-in, reset password): six
 * boxes (paste and the browser's one-time-code suggestion fill them), the code is sent at the sixth digit, a wrong
 * code shakes the boxes once (not with reduced motion) and shows the server's own message under them, "Send a new
 * code in 0:42" then "Send a new code", the server's "Wait N seconds ..." restarts the timer at N, and a code that
 * could not be sent can be asked for again at once. The page owns its button: `confirm`, `ready` and `loading`.
 */
export function useCodeEntry({
  onVerify,
  onResend,
  sentTo,
  codeSent = true,
  firstWait = RESEND_WAIT_S,
  onError,
  onResent,
  look = "owner",
  autoFocus = true,
}: {
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<unknown>;
  /** The masked address, for "New code sent to a***@gmail.com". */
  sentTo?: string;
  /** false when the first code could not be sent: the message shows and the link is ready. */
  codeSent?: boolean;
  /** Seconds left of the 60 s wait when the step opens (less after a refresh). */
  firstWait?: number;
  /** A page-specific answer (an expired sign-in step, say); return true when handled. */
  onError?: (err: unknown) => boolean;
  onResent?: () => void;
  /** "admin" uses the admin console's own message and link styles. */
  look?: "owner" | "admin";
  /** false when the page asks for something else first (the email on the reset page). */
  autoFocus?: boolean;
}) {
  const [code, setCodeState] = useState(EMPTY_CODE);
  const [error, setError] = useState<string | null>(codeSent ? null : NOT_SENT_MESSAGE);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [shaking, setShaking] = useState(false);
  const wait = useWait(codeSent ? Math.max(0, Math.round(firstWait)) : 0);
  const busy = useRef(false);
  const lastSent = useRef<string | null>(null);

  const shake = () => {
    setShaking(false);
    window.requestAnimationFrame(() => setShaking(true)); // restart the animation each time
  };

  async function send(value: string, auto = false) {
    if (!/^\d{6}$/.test(value) || busy.current) return;
    if (auto && value === lastSent.current) return; // the same six digits are never sent twice by themselves
    lastSent.current = value;
    busy.current = true;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await onVerify(value);
    } catch (err) {
      if (!onError?.(err)) {
        shake();
        setCodeState(EMPTY_CODE); // the boxes empty for the next try (the message stays)
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not reach the server. Check your connection and try again.",
        );
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function askAgain() {
    if (resending) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setError("No connection. Check your internet and try again.");
      return;
    }
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      await onResend();
      setCodeState(EMPTY_CODE);
      lastSent.current = null;
      setInfo(sentTo ? `New code sent to ${sentTo}.` : "New code sent.");
      wait.restart();
      onResent?.();
    } catch (err) {
      if (onError?.(err)) return;
      if (err instanceof ApiError) {
        // "Wait N seconds before asking for another code." restarts the timer at N
        const waitFor = /Wait (\d+) seconds/.exec(err.message);
        if (waitFor) wait.restart(Number(waitFor[1]));
        // a code that could not be sent may be asked for again at once
        if (err.status === 503) wait.restart(0);
        setError(err.message);
      } else {
        setError("Could not send a new code. Check your connection.");
      }
    } finally {
      setResending(false);
    }
  }

  const setCode = (c: string) => {
    setCodeState(c);
    setError(null);
    if (/^\d{6}$/.test(c)) void send(c, true); // sent at the sixth digit (typed, pasted or suggested)
  };

  const admin = look === "admin";
  const boxes = (
    <>
      <div className={cn(shaking && "ah-code-shake")} onAnimationEnd={() => setShaking(false)}>
        <CodeBoxes
          value={code}
          onChange={setCode}
          invalid={!!error && error !== NOT_SENT_MESSAGE}
          autoFocus={autoFocus}
        />
      </div>
      {error && (
        <p
          role="alert"
          className={
            admin
              ? "ah-auth-error"
              : "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {error}
        </p>
      )}
      {info && (
        <p
          role="status"
          className={
            admin ? "ah-auth-info" : "rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
          }
        >
          {info}
        </p>
      )}
    </>
  );

  const linkClass = admin
    ? "ah-auth-link"
    : "min-h-11 font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground";
  const resendLink =
    wait.left > 0 ? (
      <span className={admin ? undefined : "inline-flex min-h-11 items-center"} aria-live="polite">
        Send a new code in <b className="text-foreground tabular-nums">{formatWait(wait.left)}</b>
      </span>
    ) : (
      <button type="button" className={linkClass} onClick={askAgain} disabled={resending}>
        {resending ? "Sending…" : "Send a new code"}
      </button>
    );

  return {
    code,
    boxes,
    resendLink,
    confirm: () => void send(code),
    ready: /^\d{6}$/.test(code),
    loading,
    clearCode: () => {
      setCodeState(EMPTY_CODE);
      lastSent.current = null;
    },
    showError: (message: string) => {
      setError(message);
      shake();
    },
  };
}
