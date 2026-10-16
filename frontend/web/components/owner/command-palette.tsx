"use client";

/**
 * The owner's command palette (prototype `.cmdk`), opened with ⌘K / Ctrl+K
 * on any owner page or from the top bar's search. It searches what the
 * owner already has loaded: the owner pages, their own arenas, and those
 * arenas' courts. There is no customer search (no endpoint for it).
 * Same markup and keyboard handling as the admin palette.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { Dialog as DialogPrimitive } from "radix-ui";

import { OWNER_NAV } from "@/components/owner/sidebar";
import { useMyArenas } from "@/hooks/useArenas";
import { cn } from "@/lib/utils";
import { listCourts } from "@/services/courts";

type Result = { id: string; group: string; label: string; hint: string; href: string };

const PAGES: Result[] = OWNER_NAV.flatMap((g) =>
  g.items.map((i) => ({
    id: `page:${i.href}`,
    group: "Pages",
    label: i.label,
    hint: "",
    href: i.href,
  })),
);

export function OwnerCommandPalette({
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
  const openerRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open)
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  const { data: arenaPage } = useMyArenas();
  const arenas = useMemo(() => arenaPage?.items ?? [], [arenaPage]);
  // the courts of each arena (the same queries the Courts page uses)
  const courtQueries = useQueries({
    queries: arenas.map((a) => ({
      queryKey: ["courts", a.id],
      queryFn: () => listCourts(a.id),
      enabled: open,
    })),
  });
  const courtsLoading = open && courtQueries.some((c) => c.isLoading);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const has = (s: string) => s.toLowerCase().includes(needle);
    const arenaResults: Result[] = arenas
      .filter((a) => has(a.name) || has(a.city) || has(a.area ?? ""))
      .map((a) => ({
        id: `arena:${a.id}`,
        group: "Arenas",
        label: a.name,
        hint: [a.area, a.city].filter(Boolean).join(" · "),
        href: `/owner/arenas`,
      }));
    const courtResults: Result[] = needle
      ? arenas.flatMap((a, i) =>
          (courtQueries[i]?.data ?? [])
            .filter((c) => has(c.name) || has(a.name))
            .map((c) => ({
              id: `court:${c.id}`,
              group: "Courts",
              label: c.name,
              hint: a.name,
              href: `/owner/courts?arena=${a.id}`,
            })),
        )
      : [];
    return [...PAGES.filter((p) => has(p.label)), ...arenaResults, ...courtResults];
  }, [q, arenas, courtQueries]);

  useEffect(() => setSel(0), [q]);
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
          <DialogPrimitive.Title className="sr-only">
            Search the owner console
          </DialogPrimitive.Title>
          <input
            className="ah-cmdk-input"
            placeholder="Jump to a page, arena or court…"
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
            {q.trim() && courtsLoading && (
              <p className="ah-cmdk-note" role="status">
                Loading courts…
              </p>
            )}
            {!results.length && !courtsLoading && (
              <p className="ah-cmdk-note" role="status">
                Nothing matches. Try a page, an arena or a court name.
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
