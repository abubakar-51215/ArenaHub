/**
 * `Date.toISOString()` always reports the UTC calendar day, which drifts a
 * day behind local time for any positive UTC offset (e.g. Pakistan, UTC+5)
 * between local midnight and the offset boundary — a slot picker built on it
 * would label "today" as yesterday right after midnight. This formats the
 * date using the device's local calendar fields instead.
 */
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
