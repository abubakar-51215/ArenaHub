import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `ms`; false again as soon as it stops. */
export function useDelayedFlag(active: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return on;
}

/** True from `startMs` after `active` began until `endMs` after it began (or until it stops): a wait that is shown, but never for ever. */
export function useWindowedFlag(active: boolean, startMs: number, endMs: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const a = setTimeout(() => setOn(true), startMs);
    const b = setTimeout(() => setOn(false), endMs);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [active, startMs, endMs]);
  return on;
}
