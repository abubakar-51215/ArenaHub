"use client";

/**
 * The owner's arena choice, shared across owner pages through the URL
 * (`?arena=<id>`; no parameter = all arenas). The top bar's picker writes it;
 * pages read it. The rail keeps it on its links, so it survives moving
 * between pages. Callers sit under a <Suspense> boundary (useSearchParams).
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const ARENA_PARAM = "arena";

/** Owner routes whose data the picker really filters. The picker is shown
 *  only there; a page joins this list when its data is wired to the choice. */
export const ARENA_PICKER_ROUTES = ["/owner", "/owner/bookings", "/owner/courts", "/owner/calendar", "/owner/pricing", "/owner/revenue", "/owner/reports", "/owner/reviews", "/owner/equipment", "/owner/payments"];

export function useArenaParam(): [string, (arenaId: string) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const arenaId = params.get(ARENA_PARAM) ?? "";

  const setArenaId = useCallback(
    (next: string) => {
      const q = new URLSearchParams(params.toString());
      if (next) q.set(ARENA_PARAM, next);
      else q.delete(ARENA_PARAM);
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  return [arenaId, setArenaId];
}

/** `href` with the current arena choice kept on it. */
export function withArena(href: string, arenaId: string): string {
  return arenaId ? `${href}?${ARENA_PARAM}=${encodeURIComponent(arenaId)}` : href;
}
