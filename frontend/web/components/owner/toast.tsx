"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A short message at the bottom of the page ("Reminder sent to Hamza"). It
 * is a polite live region, so a screen reader reads it; it goes away by
 * itself after a few seconds.
 */
export function useToast(ms = 4000): [string | null, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback(
    (m: string) => {
      window.clearTimeout(timer.current);
      setMessage(m);
      timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [message, show];
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className="ah-toast-host" role="status" aria-live="polite">
      {message && <div className="ah-toast">{message}</div>}
    </div>
  );
}
