"use client";

import { useSyncExternalStore } from "react";

import { AdminAlerts } from "@/components/admin/alerts";
import { currentAdminTheme, toggleAdminTheme } from "@/lib/admin-theme";

/** Follows html[data-theme] so the button stays right if another tab changes it. */
function useIsDark() {
  return useSyncExternalStore(
    (notify) => {
      const obs = new MutationObserver(notify);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => currentAdminTheme() === "dark",
    () => false,
  );
}

/**
 * The admin prototype's desktop top bar (design/prototypes/arena-hub-admin.html
 * `.topbar`), shown only on the Dashboard at 1024px and up. It keeps the
 * search button, the theme toggle and the alerts button; the prototype's
 * "Production" picker and "Broadcast" button are left out on purpose.
 * Below 1024px the slim bar (menu button + brand mark) is used instead.
 */
export function AdminTopbar({
  onSearch,
}: {
  onSearch?: () => void;
}) {
  const dark = useIsDark();
  return (
    <header className="ah-topbar ah-topbar-desk">
      <button type="button" className="ah-searchbar" onClick={onSearch}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        Search pages, players, owners
        <span className="ah-kbd">⌘K</span>
      </button>
      <div className="ah-topbar-right">
        <button type="button" className="ah-icon-btn" aria-label="Switch theme" aria-pressed={dark} onClick={() => toggleAdminTheme()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        </button>
        <AdminAlerts />
      </div>
    </header>
  );
}
