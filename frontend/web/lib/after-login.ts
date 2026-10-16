/**
 * Where to go after signing in: the page the visitor opened before the sign-in
 * page (the middleware passes it as `?next=`), if it belongs to this console,
 * else the console's home. Only same-site paths under `home` are followed.
 */
export function afterLogin(home: "/owner" | "/admin"): string {
  if (typeof window === "undefined") return home;
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  const ours = next === home || next.startsWith(`${home}/`) || next.startsWith(`${home}?`);
  return ours && !next.startsWith("//") && !next.includes("\\") ? next : home;
}
