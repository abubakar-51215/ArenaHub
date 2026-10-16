import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A whole-second countdown (the 60 s "Resend code in 0:47" wait). It reads the
 * clock rather than counting ticks, so a throttled background tab or a
 * suspended app shows the right time when it wakes. `restart()` starts it
 * again from `seconds`.
 */
export function useCountdown(seconds: number, startNow = true) {
  const endsAt = useRef<number>(startNow ? Date.now() + seconds * 1000 : 0);
  const [remaining, setRemaining] = useState(startNow ? seconds : 0);
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  const restart = useCallback(
    (from: number = seconds) => {
      endsAt.current = Date.now() + from * 1000;
      setRemaining(from);
    },
    [seconds],
  );

  return { remaining, running, restart };
}

/** 47 -> "0:47", 60 -> "1:00". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
