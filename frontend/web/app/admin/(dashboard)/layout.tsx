"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AdminSidebar } from "@/components/admin/sidebar";
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
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
    </div>
  );
}
