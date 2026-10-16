/**
 * The ten sports an owner can pick (user decision, G2). `value` is what the
 * backend stores in `sports_offered` / `sport_types`; `label` is what a person
 * reads. The mobile app keeps the same ten in frontend/mobile/constants/sports.ts.
 * The backend does not check the values yet (logged as later work), so an old
 * row may hold another word; the forms keep such a word ticked so saving does
 * not drop it.
 */
export const SPORTS = [
  { value: "futsal", label: "Futsal" },
  { value: "cricket", label: "Cricket" },
  { value: "padel", label: "Padel" },
  { value: "badminton", label: "Badminton" },
  { value: "table_tennis", label: "Table tennis" },
  { value: "squash", label: "Squash" },
  { value: "basketball", label: "Basketball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "snooker", label: "Snooker" },
  { value: "tennis", label: "Tennis" },
] as const;

const KNOWN = new Set<string>(SPORTS.map((s) => s.value));

/** Stored words outside the ten (old data), in the order they were saved. */
export function otherSports(values: string[]): string[] {
  return values.filter((v) => !KNOWN.has(v));
}
