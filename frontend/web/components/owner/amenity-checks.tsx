"use client";

import { useAmenityList } from "@/hooks/useArenas";

/**
 * The amenity picker for the arena form: the standard list as tick boxes, built the same way as the
 * sport picker (same rows, same spacing, wraps on a phone). Any older typed amenity that matches nothing
 * on the list stays ticked until the owner unticks it; it cannot be added again.
 */
export function AmenityChecks({
  value,
  onChange,
  extra,
  onExtraChange,
  idPrefix,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  extra: string[];
  onExtraChange: (next: string[]) => void;
  idPrefix: string;
}) {
  const list = useAmenityList();
  if (list.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (list.isError || !list.data) {
    return (
      <div className="ah-card-error" role="alert">
        <span>Could not load the amenity list.</span>
        <button type="button" className="ah-link" onClick={() => void list.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  const options = [
    ...list.data.map((a) => ({ id: a.key, label: a.name, on: value.includes(a.key), old: false })),
    ...extra.map((t) => ({ id: `old-${t}`, label: t, on: true, old: true })),
  ];
  const toggle = (o: (typeof options)[number]) => {
    if (o.old) onExtraChange(extra.filter((t) => `old-${t}` !== o.id));
    else onChange(value.includes(o.id) ? value.filter((x) => x !== o.id) : [...value, o.id]);
  };
  return (
    <div
      role="group"
      aria-label="Amenities"
      className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3"
    >
      {options.map((o) => (
        <label
          key={o.id}
          htmlFor={`${idPrefix}-${o.id}`}
          className="flex min-h-9 cursor-pointer items-center gap-2 text-sm max-md:min-h-11 coarse:min-h-11"
        >
          <input
            id={`${idPrefix}-${o.id}`}
            type="checkbox"
            checked={o.on}
            onChange={() => toggle(o)}
            className="size-4 accent-[var(--ink,#0f1a15)]"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
