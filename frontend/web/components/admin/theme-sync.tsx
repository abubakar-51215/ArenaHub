"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { applyAdminTheme, isAdminPath, readAdminTheme } from "@/lib/admin-theme";

/**
 * Keeps html[data-theme="dark"] in step with the route: on while an /admin
 * page is open (if the admin chose dark), removed everywhere else. This is
 * what keeps the owner and public pages light after a client-side navigation
 * away from the admin panel. The first paint is handled by the inline script
 * in the root layout.
 */
export function AdminThemeSync() {
  const pathname = usePathname();

  // layout effect: runs before the browser paints the new route
  useLayoutEffect(() => {
    applyAdminTheme(isAdminPath(pathname) ? readAdminTheme() : null);
  }, [pathname]);

  // another tab changed the choice
  useLayoutEffect(() => {
    const onStorage = () => {
      if (isAdminPath(window.location.pathname)) applyAdminTheme(readAdminTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
