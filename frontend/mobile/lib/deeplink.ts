/**
 * Deep links opened while signed out. The signed-out app only has Log in, so a link such as arenahub://play/abc cannot open
 * yet: the path is kept in memory, and after the person signs in the app goes Home and then opens it. Only screens that need
 * a sign-in are kept (a link to Log in itself is not).
 */
const KEEP = [
  'booking', 'arena', 'court', 'play', 'profile', 'notifications', 'support', 'filters', 'results', '(tabs)',
  // the tab screens and the admin screens, so "Try again" after a failed start can reopen them too
  'bookings', 'search', 'admin',
];

/** "arenahub://play/abc?x=1" or "exp://host:8081/--/play/abc" becomes "/play/abc?x=1"; null when it is not a screen to keep. */
export function pathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let rest = url.trim();
  const dev = rest.indexOf('/--/');
  if (dev >= 0) rest = rest.slice(dev + 4);
  else rest = rest.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, ''); // arenahub:// , the first part is already the path
  rest = rest.replace(/^\/+/, '');
  if (/^https?:/i.test(url) && dev < 0) rest = rest.replace(/^[^/]+\/?/, ''); // a web address: drop the host
  if (!rest) return null;
  const first = rest.split(/[/?#]/)[0];
  if (!KEEP.includes(first)) return null;
  return `/${rest}`;
}

let pending: string | null = null;

/** Remember a link while nobody is signed in. */
export const rememberLink = (path: string | null) => {
  if (path) pending = path;
};

/** The remembered link, once (it is cleared as it is taken). */
export function takePendingLink(): string | null {
  const p = pending;
  pending = null;
  return p;
}

/** Whether a kept link suits the person who signed in: admins only reopen admin screens, players never do. */
export const linkFitsRole = (path: string, role: string | undefined): boolean =>
  role === 'admin' ? path === '/admin' || path.startsWith('/admin/') : !(path === '/admin' || path.startsWith('/admin/'));
