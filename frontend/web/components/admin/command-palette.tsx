"use client";

/**
 * The admin prototype's command palette (`.cmdk`), opened with ⌘K / Ctrl+K on
 * any admin page or from the Dashboard's search button.
 *
 * It searches only what the admin API can search today: the admin pages
 * (the rail's own list), and players and arena owners by name or email via
 * GET /admin/users?search=. Bookings, payments and complaints have filters
 * but no text search, so they are not offered here.
 *
 * Radix Dialog supplies the focus trap, Escape to close and focus restore.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "radix-ui";

import { NAV_GROUPS } from "@/components/admin/sidebar";
import { cn } from "@/lib/utils";
import { listUsers } from "@/services/admin";

type Result = { id: string; group: string; label: string; hint: string; href: string };

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

const PAGES: Result[] = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({
    id: `page:${i.href}`,
    group: "Pages",
    label: i.label,
    hint: "",
    href: i.href,
  })),
);

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useCommandPaletteShortcut(setOpen: (fn: (o: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // not over the open phone drawer (a modal of its own): close it first
        const drawer = document.getElementById("ah-drawer");
        if (drawer?.getAttribute("role") === "dialog" && !drawer.inert) return;
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // whatever had focus when the palette opened gets it back when it closes
  const openerRef = useRef<HTMLElement | null>(null);
  // layout effect: runs before Radix moves focus into the dialog
  useLayoutEffect(() => {
    if (open)
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);
  const term = useDebounced(q.trim(), DEBOUNCE_MS);
  const searching = term.length >= MIN_QUERY;

  const users = useQuery({
    queryKey: ["admin-palette-users", term],
    queryFn: () => listUsers({ search: term, page: 1, page_size: 8 }),
    enabled: open && searching,
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(needle));
    const people = searching ? (users.data?.items ?? []) : [];
    const toResult = (u: (typeof people)[number], group: string, base: string): Result => ({
      id: `user:${u.id}`,
      group,
      label: u.full_name,
      hint: u.is_active ? u.email : `${u.email} · suspended`,
      href: `${base}?search=${encodeURIComponent(u.email)}`,
    });
    return [
      ...pages,
      ...people
        .filter((u) => u.role === "player")
        .map((u) => toResult(u, "Players", "/admin/users")),
      ...people
        .filter((u) => u.role === "owner")
        .map((u) => toResult(u, "Arena owners", "/admin/owners")),
    ];
  }, [q, searching, users.data]);

  // a new query starts the selection at the top again
  useEffect(() => setSel(0), [q, users.data]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const close = (o: boolean) => {
    if (!o) setQ("");
    onOpenChange(o);
  };

  const choose = (r: Result | undefined) => {
    if (!r) return;
    close(false);
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (s + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (s - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[sel]);
    }
  };

  const pending = q.trim() !== term || (searching && users.isFetching);
  let lastGroup = "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={close}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ah-cmdk" />
        <DialogPrimitive.Content
          className="ah-cmdk-box"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search the admin panel</DialogPrimitive.Title>
          <input
            className="ah-cmdk-input"
            placeholder="Jump to a page, player or owner…"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="ah-cmdk-list"
            aria-activedescendant={results[sel] ? `ah-cmdk-${sel}` : undefined}
            aria-autocomplete="list"
          />
          <div
            className="ah-cmdk-list"
            id="ah-cmdk-list"
            role="listbox"
            ref={listRef}
            aria-label="Results"
          >
            {results.map((r, i) => {
              const head = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <div key={r.id} role="presentation">
                  {head && (
                    <p className="ah-cmdk-group" role="presentation">
                      {head}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`ah-cmdk-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === sel}
                    tabIndex={-1}
                    className={cn("ah-cmdk-item", i === sel && "is-sel")}
                    onMouseMove={() => setSel(i)}
                    onClick={() => choose(r)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <span className="ah-cmdk-label">{r.label}</span>
                    {r.hint && <small>{r.hint}</small>}
                  </button>
                </div>
              );
            })}
            {searching && pending && (
              <p className="ah-cmdk-note" role="status">
                Searching players and owners…
              </p>
            )}
            {searching && users.isError && !pending && (
              <p className="ah-cmdk-note is-error" role="status">
                Couldn&apos;t search players and owners.{" "}
                <button type="button" className="ah-link" onClick={() => users.refetch()}>
                  Try again
                </button>
              </p>
            )}
            {!results.length && !pending && !users.isError && (
              <p className="ah-cmdk-note" role="status">
                {q.trim().length > 0 && q.trim().length < MIN_QUERY
                  ? "Keep typing to search players and owners."
                  : "Nothing matches. Try a player's or owner's name or email."}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
