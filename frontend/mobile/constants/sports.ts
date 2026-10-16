/**
 * The one list of sports for the mobile app (user decision, G2). `value` is
 * what the backend stores in `sports_offered` / `sport_types`; `label` is what
 * a person reads. The backend does not check values yet (logged as later work
 * in docs/MOBILE_REQUIREMENTS.md), so old rows may hold other words: an old
 * "football" is shown as Futsal, and any other unknown word is shown as it is,
 * tidied. The owner web app keeps the same ten values in
 * frontend/web/lib/sports.ts.
 */
export const SPORTS = [
  { value: 'futsal', label: 'Futsal' },
  { value: 'cricket', label: 'Cricket' },
  { value: 'padel', label: 'Padel' },
  { value: 'badminton', label: 'Badminton' },
  { value: 'table_tennis', label: 'Table tennis' },
  { value: 'squash', label: 'Squash' },
  { value: 'basketball', label: 'Basketball' },
  { value: 'volleyball', label: 'Volleyball' },
  { value: 'snooker', label: 'Snooker' },
  { value: 'tennis', label: 'Tennis' },
] as const;

export type SportValue = (typeof SPORTS)[number]['value'];
export const SPORT_VALUES: string[] = SPORTS.map((s) => s.value);

/** Old data: "football" is the same game as futsal here. */
export function normalizeSport(value: string): string {
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return v === 'football' ? 'futsal' : v;
}

export function sportLabel(value: string): string {
  const v = normalizeSport(value);
  const known = SPORTS.find((s) => s.value === v);
  if (known) return known.label;
  const words = v.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Which court picture a sport has: three have their own, everything else uses the plain pitch. */
export type CourtArtKind = 'cricket' | 'badminton' | 'padel' | 'pitch';
export function courtArtFor(value: string | undefined): CourtArtKind {
  const v = normalizeSport(value ?? '');
  return v === 'cricket' || v === 'badminton' || v === 'padel' ? v : 'pitch';
}
