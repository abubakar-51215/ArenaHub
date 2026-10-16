"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { CommandPalette, useCommandPaletteShortcut } from "@/components/admin/command-palette";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminSlimActions, AdminTopbar } from "@/components/admin/topbar";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { useAuthStore } from "@/store/auth";

/**
 * Admin shell + client-side auth guard, mirroring the owner layout. Lives in
 * a route group so ``/admin/login`` (a sibling, not nested here) never
 * inherits this guard.
 */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hydrated, user, accessToken } = useAuthStore();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(setPaletteOpen);

  // Dialogs render in a portal under <body>, outside the shell. Marking
  // <body> while an admin page is open lets the [data-admin]-scoped styles in
  // globals.css reach them too. Removed again when the admin layout unmounts.
  useEffect(() => {
    document.body.setAttribute("data-admin", "");
    return () => document.body.removeAttribute("data-admin");
  }, []);

  useEffect(() => {
    if (hydrated && (!accessToken || user?.role !== "admin")) {
      router.replace("/admin/login");
    }
  }, [hydrated, user, accessToken, router]);

  if (!hydrated || !accessToken || user?.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <DashboardShell
      variant="admin"
      sidebar={(close) => <AdminSidebar onNavigate={close} />}
      slimActions={<AdminSlimActions onSearch={() => setPaletteOpen(true)} />}
    >
      {/* the top bar belongs to the Dashboard only (1024px and up, see CSS) */}
      {pathname === "/admin" && <AdminTopbar onSearch={() => setPaletteOpen(true)} />}
      <div className="ah-canvas">{children}</div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </DashboardShell>
  );
}
