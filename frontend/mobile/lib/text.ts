/** Parts of a line joined with " · ", skipping any that are empty (no "A · · B"). */
export function dotJoin(parts: (string | null | undefined | false)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(sep);
}
