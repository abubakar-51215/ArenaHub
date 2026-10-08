"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

import { applyAdminTheme, isAdminPath, readAdminTheme } from "@/lib/admin-theme";

/**
 * Keeps html[data-theme="dark"] in step with the route: on while an /admin
 * or /owner page is open (if dark was chosen), removed everywhere else. This
 * is what keeps the public and sign-in pages light after a client-side
 * navigation away from a dashboard. The first paint is handled by the inline script
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
