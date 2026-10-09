"use client";

/**
 * Open state for a form dialog that is unmounted when closed (the owner
 * pages render `{open && <Form/>}`). Radix cannot hand focus back to the
 * button that opened it once the dialog is gone, so this remembers the
 * focused element on open and focuses it again on close.
 */
import { useCallback, useRef, useState } from "react";

export function useFormDialog(): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const setOpen = useCallback((next: boolean) => {
    if (next) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else {
      const el = opener.current;
      opener.current = null;
      // after the dialog has unmounted and released its focus trap
      if (el) requestAnimationFrame(() => el.isConnected && el.focus());
    }
    setOpenState(next);
  }, []);

  return [open, setOpen];
}
