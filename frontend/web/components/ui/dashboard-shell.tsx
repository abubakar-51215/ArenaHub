"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

import { AdminBrandMark } from "@/components/admin/brand";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const ADMIN_STATIC_QUERY = "(min-width: 1024px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Responsive dashboard chrome shared by the owner and admin shells.
 * - Desktop (xl+): the sidebar is static in the flex row.
 * - Mobile/tablet: the sidebar slides in as an overlay drawer, toggled from a
 *   compact top bar; navigating closes it.
 * `variant="admin"` sets [data-admin], which scopes the admin prototype's
 * shell styles (globals.css), uses the prototype's topbar and brand mark, and
 * keeps the rail static from 1024px (lg) instead of 1280px (xl). Below 1024px
 * the admin drawer behaves as a modal: Escape and the backdrop close it, focus
 * stays inside while it is open and goes back to the menu button after, the
 * page behind it is inert and does not scroll, and crossing 1024px closes it.
 * The owner variant renders exactly as before.
 */
export function DashboardShell({
  sidebar,
  children,
  variant = "owner",
}: {
  sidebar: (closeMobile: () => void) => React.ReactNode;
  children: React.ReactNode;
  variant?: "owner" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const admin = variant === "admin";

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
        {/* Mobile top bar */}
        {admin ? (
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
            <AdminBrandMark />
          </header>
        ) : (
          <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 xl:hidden">
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex size-9 max-md:size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Menu className="size-5" />
            </button>
            <Logo />
          </header>
        )}

        <main className="flex-1 overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
