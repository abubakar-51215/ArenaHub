/**
 * Dark theme for the two dashboards (admin and owner). The theme is the
 * attribute html[data-theme="dark"] (the same hook both prototypes use). It
 * exists only while an /admin or /owner route is open: the inline script
 * below sets it before first paint, and AdminThemeSync
 * (components/admin/theme-sync.tsx) removes it again on the public and
 * sign-in pages, which stay light. One preference, shared by both
 * dashboards, is kept in localStorage; every access is wrapped because
 * storage can be blocked.
 */
export const ADMIN_THEME_KEY = "ah-admin-theme";

export type AdminTheme = "light" | "dark";

/** The routes that follow the dashboard theme: /admin/* and /owner/*. */
export function isAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/owner" ||
    pathname.startsWith("/owner/")
  );
}

export function readAdminTheme(): AdminTheme {
  try {
    return window.localStorage.getItem(ADMIN_THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Put the attribute on <html> (dark) or take it off (light, or leaving the dashboards). */
export function applyAdminTheme(theme: AdminTheme | null): void {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

export function saveAdminTheme(theme: AdminTheme): void {
  try {
    window.localStorage.setItem(ADMIN_THEME_KEY, theme);
  } catch {
    // storage blocked: the choice simply lasts until the tab closes
  }
}

export function currentAdminTheme(): AdminTheme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function toggleAdminTheme(): AdminTheme {
  const next: AdminTheme = currentAdminTheme() === "dark" ? "light" : "dark";
  applyAdminTheme(next);
  saveAdminTheme(next);
  return next;
}

/** Runs in <head> before the first paint, so there is no light flash on
 *  reload. Plain ES5 on purpose: it is inlined as a string. */
export const ADMIN_THEME_SCRIPT = `(function(){try{var p=location.pathname;if(p==="/admin"||p.indexOf("/admin/")===0||p==="/owner"||p.indexOf("/owner/")===0){var t=null;try{t=localStorage.getItem("${ADMIN_THEME_KEY}")}catch(e){}if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}}catch(e){}})();`;
