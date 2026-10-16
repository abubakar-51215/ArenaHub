"use client";

/**
 * The owner top bar (prototype `.topbar`), on every owner page at 1024px and
 * wider: the arena picker (only on pages whose data it really filters), the
 * search button (opens the owner palette), the theme switch and the
 * notifications bell. The prototype's "New booking" button is left out:
 * owners have no booking endpoint. Below 1024px the slim bar carries search,
 * theme and bell (OwnerSlimActions) and the picker sits in a row under it
 * (OwnerPickerRow).
 */
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";

import { ThemeButton, useIsDark } from "@/components/admin/topbar";
import { OwnerAlerts } from "@/components/owner/alerts";
import { useMyArenas } from "@/hooks/useArenas";
import { ARENA_PICKER_ROUTES, useArenaParam } from "@/hooks/useArenaParam";

function usePickerShown(): boolean {
  const pathname = usePathname();
  return ARENA_PICKER_ROUTES.includes(pathname);
}

/** Prototype `.venue-pick`: "All arenas" or one of the owner's arenas. */
export function ArenaPicker() {
  const { data } = useMyArenas();
  const arenas = data?.items ?? [];
  const [arenaId, setArenaId] = useArenaParam();
  const current = arenas.find((a) => a.id === arenaId);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="ah-venue-pick"
          aria-label={`Arena: ${current?.name ?? "All arenas"}`}
        >
          <span className="ah-venue-dot" aria-hidden="true" />
          <b>{current?.name ?? "All arenas"}</b>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ah-menu ah-menu-pick" align="start" sideOffset={6}>
          <DropdownMenu.RadioGroup value={current ? current.id : ""} onValueChange={setArenaId}>
            <DropdownMenu.RadioItem value="" className="ah-menu-item">
              <span className="ah-menu-check" aria-hidden="true">
                {!current ? "✓" : ""}
              </span>
              All arenas
            </DropdownMenu.RadioItem>
            {arenas.map((a) => (
              <DropdownMenu.RadioItem key={a.id} value={a.id} className="ah-menu-item">
                <span className="ah-menu-check" aria-hidden="true">
                  {current?.id === a.id ? "✓" : ""}
                </span>
                <span className="min-w-0 truncate">{a.name}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SearchIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function OwnerTopbar({ onSearch }: { onSearch: () => void }) {
  const dark = useIsDark();
  const picker = usePickerShown();
  return (
    <header className="ah-topbar ah-topbar-desk">
      {picker && <ArenaPicker />}
      <button type="button" className="ah-searchbar" onClick={onSearch}>
        <SearchIcon />
        Search pages, arenas, courts
        <span className="ah-kbd">⌘K</span>
      </button>
      <div className="ah-topbar-right">
        <ThemeButton dark={dark} />
        <OwnerAlerts />
      </div>
    </header>
  );
}

/** Slim bar (below 1024px): search, theme and bell as 44px buttons. */
export function OwnerSlimActions({ onSearch }: { onSearch: () => void }) {
  const dark = useIsDark();
  return (
    <div className="ah-slim-actions">
      <button type="button" className="ah-icon-btn" aria-label="Search" onClick={onSearch}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      <ThemeButton dark={dark} />
      <OwnerAlerts />
    </div>
  );
}

/** Below 1024px the picker gets its own row under the slim bar. */
export function OwnerPickerRow() {
  const picker = usePickerShown();
  if (!picker) return null;
  return (
    <div className="ah-pickrow">
      <ArenaPicker />
    </div>
  );
}
