/**
 * "₨ 1,200" (the prototype's money()), and "₨ 2,500.50" when there are paisa, so the phone shows the same amount as the
 * owner and admin web apps and the server (never rounded). Takes a number or the API's decimal string. The grouping is
 * done here, not by the phone's locale, so every phone prints 1,234,567 the same way.
 */
export function formatRs(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '';
  const cents = Math.round(Math.abs(n) * 100);
  const whole = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const paisa = cents % 100;
  return `₨ ${n < 0 && cents > 0 ? '-' : ''}${whole}${paisa ? `.${String(paisa).padStart(2, '0')}` : ''}`;
}
