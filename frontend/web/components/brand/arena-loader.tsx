"use client";

import { useEffect, useState } from "react";

import { BALL_FACES, BALL_KEYS, LOADER_CSS, MARK_INNER } from "@/components/brand/arena-mark.generated";
import { useAuthStore } from "@/store/auth";

const RING2 =
  "M14 58 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V54 A38 38 0 0 1 52 16 H68 A38 38 0 0 1 106 54 V62 A38 38 0 0 1 68 100 H52 A38 38 0 0 1 14 62 V58";

/** All eight in a random order (one ball per lap). */
function shuffled<T>(a: readonly T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function loaderHtml(size: number, dark: boolean, order: readonly string[]): string {
  const run = dark ? "#C4F546" : "#7FA30F";
  const faces = order
    .map((k, i) => `<svg class="bm-lf bm-k${i}" style="--k:${i}" viewBox="-9 -9 18 18" width="18" height="18" aria-hidden="true">${BALL_FACES[k]}</svg>`)
    .join("");
  return (
    `<div class="bm-ldbox" style="transform:scale(${size / 120})"><svg class="bm-hsvg" viewBox="0 0 120 120" width="120" height="120" overflow="visible" aria-hidden="true">${dark ? MARK_INNER.loaderDark : MARK_INNER.loaderLight}` +
    `<path class="bm-lrun" d="${RING2}" pathLength="200" fill="none" stroke="${run}" stroke-width="4.6" stroke-linecap="round"/></svg>` +
    `<div class="bm-lball"><div class="bm-lsp">${faces}</div></div></div>`
  );
}

const MIN_MS = 450; // long enough to show one ball
const FADE_MS = 200;

/**
 * The loader of the first page load (72 px, a different ball every lap, random order): it covers the
 * page while the app loads and the saved session is read, then fades away. It does not show again on
 * navigation inside the app. Follows the system colour scheme.
 */
export function FirstLoadLoader() {
  const [phase, setPhase] = useState<"show" | "fade" | "gone">("show");
  // the server draws a fixed order (so hydration matches); the browser shuffles it as soon as it mounts
  const [order, setOrder] = useState<readonly string[]>(BALL_KEYS);
  useEffect(() => setOrder(shuffled(BALL_KEYS)), []);

  useEffect(() => {
    const started = Date.now();
    let cancelled = false;
    const done = () => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_MS - (Date.now() - started));
      setTimeout(() => {
        if (cancelled) return;
        setPhase("fade");
        setTimeout(() => !cancelled && setPhase("gone"), FADE_MS);
      }, wait);
    };
    const ready = () => document.readyState === "complete" && useAuthStore.persist.hasHydrated();
    if (ready()) {
      done();
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(() => {
      if (ready()) {
        clearInterval(timer);
        done();
      }
    }, 60);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (phase === "gone") return null;
  const box = { width: 72, height: 72, position: "relative" } as const;
  return (
    <div className="am-firstload" data-phase={phase} role="status" aria-label="Loading ArenaHub">
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      <div className="am-fl-light" dangerouslySetInnerHTML={{ __html: loaderHtml(72, false, order) }} style={box} />
      <div className="am-fl-dark" dangerouslySetInnerHTML={{ __html: loaderHtml(72, true, order) }} style={box} />
    </div>
  );
}
