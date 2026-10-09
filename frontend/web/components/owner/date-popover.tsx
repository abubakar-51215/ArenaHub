"use client";

/**
 * A small calendar in a popover, to jump the Live Board to any date. The
 * button opens it with Enter or Space; arrow keys move between days (Page Up
 * and Down change the month, Home and End jump to the start and end of the
 * week), Enter or Space picks, and Escape closes it and gives focus back to
 * the button. Dates are Asia/Karachi calendar dates (see lib/karachi-date).
 */
import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { addDaysIso, addMonthsIso, monthGrid, monthTitle, shiftMonth, weekdayIndex } from "@/lib/karachi-date";
import { cn } from "@/lib/utils";

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function DatePopover({
  value,
  today,
  onChange,
}: {
  value: string;
  today: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusIso, setFocusIso] = useState(value);
  const moved = useRef(false);

  // keep the roving focus on the day the keys moved to
  useEffect(() => {
    if (!open || !moved.current) return;
    document.querySelector<HTMLElement>(`[data-day="${focusIso}"]`)?.focus();
  }, [open, focusIso]);

  const month = addMonthsIso(focusIso, 0);
  const days = monthGrid(month);

  function move(iso: string) {
    moved.current = true;
    setFocusIso(iso);
  }

  function onKey(e: React.KeyboardEvent) {
    const step: Record<string, string> = {
      ArrowLeft: addDaysIso(focusIso, -1),
      ArrowRight: addDaysIso(focusIso, 1),
      ArrowUp: addDaysIso(focusIso, -7),
      ArrowDown: addDaysIso(focusIso, 7),
      Home: addDaysIso(focusIso, -weekdayIndex(focusIso)),
      End: addDaysIso(focusIso, 6 - weekdayIndex(focusIso)),
      PageUp: shiftMonth(focusIso, -1),
      PageDown: shiftMonth(focusIso, 1),
    };
    if (step[e.key]) {
      e.preventDefault();
      move(step[e.key]);
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          moved.current = false;
          setFocusIso(value);
        }
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="ah-icon-btn" aria-label="Choose a date" aria-haspopup="dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15" rx="3" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="ah-pop ah-datepop"
          align="end"
          sideOffset={8}
          aria-label="Choose a date"
          onOpenAutoFocus={(e) => {
            // focus the chosen day, not the first control
            e.preventDefault();
            document.querySelector<HTMLElement>(`[data-day="${value}"]`)?.focus();
          }}
        >
          <div className="ah-datepop-head">
            <button type="button" className="ah-icon-btn" aria-label="Previous month" onClick={() => move(shiftMonth(focusIso, -1))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <b aria-live="polite">{monthTitle(month)}</b>
            <button type="button" className="ah-icon-btn" aria-label="Next month" onClick={() => move(shiftMonth(focusIso, 1))}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div className="ah-datepop-grid" role="grid" aria-label={monthTitle(month)} onKeyDown={onKey}>
            {WEEK.map((w) => (
              <span key={w} className="ah-datepop-dow" role="columnheader" aria-hidden="true">
                {w}
              </span>
            ))}
            {days.map((iso) => (
              <button
                key={iso}
                type="button"
                role="gridcell"
                data-day={iso}
                tabIndex={iso === focusIso ? 0 : -1}
                aria-selected={iso === value}
                aria-current={iso === today ? "date" : undefined}
                className={cn(
                  "ah-datepop-day",
                  iso === value && "is-on",
                  iso === today && "is-today",
                  iso.slice(0, 7) !== month.slice(0, 7) && "is-out",
                )}
                onClick={() => {
                  onChange(iso);
                  setOpen(false);
                }}
              >
                {Number(iso.slice(8))}
              </button>
            ))}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
