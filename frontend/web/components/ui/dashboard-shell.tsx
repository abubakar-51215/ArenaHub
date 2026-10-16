"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

import { AdminBrandMark } from "@/components/admin/brand";
import { cn } from "@/lib/utils";

const ADMIN_STATIC_QUERY = "(min-width: 1024px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Responsive dashboard chrome shared by the admin and owner shells. Both set
 * [data-admin], which scopes the prototypes' shared design system
 * (globals.css; the two prototypes use the same rail, top bar and tokens);
 * the owner shell adds [data-owner] for its own rules. The rail is static
 * from 1024px. Below 1024px it is a drawer that behaves as a modal: Escape
 * and the backdrop close it, focus stays inside while it is open and goes
 * back to the menu button after, the page behind it is inert and does not
 * scroll, and crossing 1024px closes it. A slim bar (menu button, brand
 * mark, slimActions) replaces the top bar there; slimRow sits under it.
 */
export function DashboardShell({
  sidebar,
  children,
  variant = "owner",
  slimActions,
  slimRow,
  brandMark,
}: {
  sidebar: (closeMobile: () => void) => React.ReactNode;
  children: React.ReactNode;
  variant?: "owner" | "admin";
  /** controls on the right of the slim bar (below 1024px) */
  slimActions?: React.ReactNode;
  /** a row under the slim bar (below 1024px), e.g. the owner's arena picker */
  slimRow?: React.ReactNode;
  /** the slim bar's brand mark (default: the admin mark) */
  brandMark?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // both dashboards use the console shell; the name is kept from the admin
  // restyle, where it started
  const admin = true;
  const owner = variant === "owner";

  // admin only: is the rail a drawer right now (below 1024px)?
  const [isDrawer, setIsDrawer] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!admin) return;
    const mq = window.matchMedia(ADMIN_STATIC_QUERY);
    const sync = () => {
      setIsDrawer(!mq.matches);
      // resizing or rotating across 1024px never leaves the drawer open
      setOpen(false);
    };
    setIsDrawer(!mq.matches);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [admin]);

  const drawerOpen = admin && isDrawer && open;

  // while open: focus inside, Escape closes, Tab wraps within the drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const burger = burgerRef.current;
    // focus the drawer itself (no visible ring), not its first link: a tap
    // must not light up the brand block; the first Tab reaches the brand,
    // which then shows its keyboard-only :focus-visible ring
    drawer?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer) return;
      const items = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = drawer.contains(document.activeElement);
      const onFrame = document.activeElement === drawer;
      if (e.shiftKey && (document.activeElement === first || onFrame || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // back to the menu button (still there: we are below 1024px)
      if (window.matchMedia(ADMIN_STATIC_QUERY).matches) return;
      burger?.focus();
    };
  }, [drawerOpen]);

  return (
    <div
      data-theme="arena"
      data-admin={admin ? "" : undefined}
      data-owner={owner ? "" : undefined}
      data-drawer-open={drawerOpen ? "" : undefined}
      className="flex h-screen overflow-hidden bg-background"
    >
      {/* Backdrop (mobile only) */}
      <div
        onClick={close}
        aria-hidden={admin ? true : undefined}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm transition-opacity duration-300",
          admin ? "ah-drawer-overlay lg:hidden" : "xl:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div
        ref={drawerRef}
        tabIndex={admin && isDrawer ? -1 : undefined}
        id={admin ? "ah-drawer" : undefined}
        role={admin && isDrawer ? "dialog" : undefined}
        aria-modal={admin && isDrawer ? true : undefined}
        aria-label={admin && isDrawer ? "Menu" : undefined}
        // a closed drawer is off screen: keep it out of the tab order too
        inert={admin && isDrawer && !open ? true : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out",
          admin ? "ah-drawer lg:static lg:translate-x-0" : "xl:static xl:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar(close)}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden" inert={drawerOpen ? true : undefined}>
        {/* Slim bar (below 1024px) */}
        <header className="ah-topbar lg:hidden">
          <button
            ref={burgerRef}
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="ah-drawer"
            className="ah-icon-btn"
          >
            <Menu strokeWidth={1.9} />
          </button>
          {brandMark ?? <AdminBrandMark />}
          {slimActions}
        </header>
        {slimRow && <div className="lg:hidden">{slimRow}</div>}

        <main className="flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
