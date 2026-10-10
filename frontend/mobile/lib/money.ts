/** "₨ 1,200" (the prototype's money()). Takes a number or the API's decimal string. */
export function formatRs(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '';
  return `₨ ${Math.round(n).toLocaleString('en-PK')}`;
}
