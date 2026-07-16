"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AdminSidebar } from "@/components/admin/sidebar";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { useAuthStore } from "@/store/auth";

/**
 * Admin shell + client-side auth guard, mirroring the owner layout. Lives in
 * a route group so ``/admin/login`` (a sibling, not nested here) never
 * inherits this guard.
 */
export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { hydrated, user, accessToken } = useAuthStore();

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
    <DashboardShell sidebar={(close) => <AdminSidebar onNavigate={close} />}>{children}</DashboardShell>
  );
}
