"use client";

/**
 * A Button with the admin action motion (styles: `.ah-act` in globals.css):
 * a lime ("positive") or red ("negative") fill sweeping in on hover, a small
 * press dip, a spinner over the label while `busy` (the label stays in the
 * layout, so the width never changes), then a drawn tick or a short shake for
 * about a second. Buttons that only open a dialog leave `busy` unset and get
 * the sweep and the dip only. Reduced motion keeps the spinner and drops the
 * rest (CSS).
 */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<typeof Button> & {
  tone: "positive" | "negative";
  /** this button's request is running */
  busy?: boolean;
  /** read when `busy` turns false: true shows the shake, false the tick */
  failed?: boolean;
};

export function ActionButton({ tone, busy, failed, className, children, ...props }: Props) {
  const [after, setAfter] = useState<"done" | "fail" | null>(null);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      setAfter(null);
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setAfter(failed ? "fail" : "done");
    const t = window.setTimeout(() => setAfter(null), 1000);
    return () => window.clearTimeout(t);
  }, [busy, failed]);

  const state = busy ? "busy" : (after ?? "idle");
  return (
    <Button
      {...props}
      className={cn("ah-act", tone === "positive" ? "ah-act-pos" : "ah-act-neg", className)}
      data-act={state}
      aria-busy={busy || undefined}
    >
      <span className="ah-act-label">{children}</span>
      {state === "busy" && <span className="ah-act-spin" aria-hidden="true" />}
      {state === "done" && (
        <svg className="ah-act-tick" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </Button>
  );
}
