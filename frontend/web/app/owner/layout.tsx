"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useCommandPaletteShortcut } from "@/components/admin/command-palette";
import { OwnerCommandPalette } from "@/components/owner/command-palette";
import { OWNER_NAV, OwnerBrandMark, Sidebar } from "@/components/owner/sidebar";
import { OwnerPickerRow, OwnerSlimActions, OwnerTopbar } from "@/components/owner/topbar";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { useAuthStore } from "@/store/auth";

/**
 * Owner shell + client-side auth guard. Tokens live in localStorage (read
 * through the auth store), so the guard runs here after rehydration rather than
 * in edge middleware. Non-owners are bounced to the login page.
 * The shell is the owner prototype's: the rail, the top bar on every page at
 * 1024px and wider, and the slim bar with search, theme and bell below.
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, user, accessToken } = useAuthStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(setPaletteOpen);

  // Dialogs and menus render in a portal under <body>, outside the shell:
  // marking <body> lets the [data-admin]-scoped styles reach them too.
  useEffect(() => {
    document.body.setAttribute("data-admin", "");
    document.body.setAttribute("data-owner", "");
    return () => {
      document.body.removeAttribute("data-admin");
      document.body.removeAttribute("data-owner");
    };
  }, []);

  // the browser tab reads the page's menu name (the same list as the rail)
  useEffect(() => {
    const item = OWNER_NAV.flatMap((g) => g.items).find((i) => i.href === pathname);
    if (item) document.title = item.label;
  }, [pathname]);

  useEffect(() => {
    if (hydrated && (!accessToken || user?.role !== "owner")) {
      router.replace("/login");
    }
  }, [hydrated, user, accessToken, router]);

  if (!hydrated || !accessToken || user?.role !== "owner") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const openSearch = () => setPaletteOpen(true);
  return (
    <DashboardShell
      variant="owner"
      sidebar={(close) => <Sidebar onNavigate={close} />}
      brandMark={<OwnerBrandMark />}
      slimActions={<OwnerSlimActions onSearch={openSearch} />}
      slimRow={
        <Suspense fallback={null}>
          <OwnerPickerRow />
        </Suspense>
      }
    >
      {/* the desktop top bar belongs to the Live Board only; other pages keep
          the shortcut (below), the theme switch in the owner card menu and an
          arena filter in their own header */}
      {pathname === "/owner" && (
        <Suspense fallback={null}>
          <OwnerTopbar onSearch={openSearch} />
        </Suspense>
      )}
      {children}
      <OwnerCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </DashboardShell>
  );
}
