"use client";

/**
 * Six one-digit boxes for an emailed code. Typing a digit moves to the next
 * box, Backspace on an empty box goes back to the previous one, the arrow
 * keys move between boxes, and pasting a code (or using the phone's code
 * suggestion) fills all six at once. The value is always six places long,
 * with a space for an empty box, so clearing a middle box shifts nothing.
 */
import { useRef } from "react";

import { cn } from "@/lib/utils";

const LENGTH = 6;

export function CodeBoxes({
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => (value[i] ?? " ").trim());
  const emit = (next: string[]) => onChange(next.map((c) => c || " ").join(""));

  const focus = (i: number) => refs.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  function setFrom(start: number, text: string) {
    const clean = text.replace(/\D/g, "");
    if (!clean) return;
    const next = digits.slice();
    for (let k = 0; k < clean.length && start + k < LENGTH; k++) next[start + k] = clean[k];
    emit(next);
    focus(Math.min(start + clean.length, LENGTH - 1));
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={i === 0 ? LENGTH : 1}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of ${LENGTH}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-13 w-full min-w-0 max-w-14 rounded-xl border bg-card text-center text-xl font-semibold tabular-nums text-foreground outline-none transition-colors",
            "focus:border-foreground focus:ring-2 focus:ring-foreground/15",
            invalid ? "border-destructive" : "border-border",
          )}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 1) setFrom(i, v); // autofill or a fast typist
            else if (/^\d$/.test(v)) {
              const next = digits.slice();
              next[i] = v;
              emit(next);
              focus(i + 1);
            } else if (v === "") {
              const next = digits.slice();
              next[i] = "";
              emit(next);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              e.preventDefault();
              const next = digits.slice();
              next[i - 1] = "";
              emit(next);
              focus(i - 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              focus(i - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              focus(i + 1);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            setFrom(i, e.clipboardData.getData("text"));
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
