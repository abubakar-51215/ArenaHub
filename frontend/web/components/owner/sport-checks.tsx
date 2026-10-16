"use client";

import { SPORTS, otherSports } from "@/lib/sports";

/**
 * The sport picker for the arena and court forms: the ten sports as tick
 * boxes, plus any older stored word still ticked (so it is kept unless the
 * owner unticks it). Each box is a 44px row on a phone.
 */
export function SportChecks({
  value,
  onChange,
  idPrefix,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const options = [
    ...SPORTS.map((s) => ({ value: s.value as string, label: s.label })),
    ...otherSports(value).map((v) => ({ value: v, label: v })),
  ];
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div
      role="group"
      aria-label="Sports"
      className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3"
    >
      {options.map((o) => (
        <label
          key={o.value}
          htmlFor={`${idPrefix}-${o.value}`}
          className="flex min-h-9 cursor-pointer items-center gap-2 text-sm max-md:min-h-11 coarse:min-h-11"
        >
          <input
            id={`${idPrefix}-${o.value}`}
            type="checkbox"
            checked={value.includes(o.value)}
            onChange={() => toggle(o.value)}
            className="size-4 accent-[var(--ink,#0f1a15)]"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
