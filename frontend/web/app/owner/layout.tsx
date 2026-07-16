"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { Sidebar } from "@/components/owner/sidebar";
import { DashboardShell } from "@/components/ui/dashboard-shell";
import { useAuthStore } from "@/store/auth";

/**
 * Owner shell + client-side auth guard. Tokens live in localStorage (read
 * through the auth store), so the guard runs here after rehydration rather than
 * in edge middleware. Non-owners are bounced to the login page.
 */
export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { hydrated, user, accessToken } = useAuthStore();

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

  return <DashboardShell sidebar={(close) => <Sidebar onNavigate={close} />}>{children}</DashboardShell>;
}
