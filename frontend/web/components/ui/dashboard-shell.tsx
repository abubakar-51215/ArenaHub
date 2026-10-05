"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { AdminBrandMark } from "@/components/admin/brand";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Responsive dashboard chrome shared by the owner and admin shells.
 * - Desktop (xl+): the sidebar is static in the flex row.
 * - Mobile/tablet: the sidebar slides in as an overlay drawer, toggled from a
 *   compact top bar; navigating closes it.
 * `variant="admin"` sets [data-admin], which scopes the admin prototype's
 * shell styles (globals.css), and uses the prototype's topbar and brand mark.
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

  return (
    <div
      data-theme="arena"
      data-admin={variant === "admin" ? "" : undefined}
      className="flex h-screen overflow-hidden bg-background"
    >
      {/* Backdrop (mobile only) */}
      <div
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm transition-opacity duration-300 xl:hidden",
          variant === "admin" && "ah-drawer-overlay",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar — drawer on mobile, static on desktop */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-out xl:static xl:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebar(close)}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        {variant === "admin" ? (
          <header className="ah-topbar xl:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="ah-icon-btn">
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
