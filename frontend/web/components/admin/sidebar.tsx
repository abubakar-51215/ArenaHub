"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  Settings,
  Star,
  UserCog,
  Users,
  Wallet,
  BarChart3,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Arena Owners", href: "/admin/owners", icon: UserCog },
  { label: "Arenas", href: "/admin/arenas", icon: Building2 },
  { label: "Bookings", href: "/admin/bookings", icon: CalendarCheck },
  { label: "Payments", href: "/admin/payments", icon: Wallet },
  { label: "Complaints", href: "/admin/complaints", icon: MessageSquareWarning },
  { label: "Reviews", href: "/admin/reviews", icon: Star },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshToken, clear } = useAuthStore();

  async function onLogout() {
    try {
      if (refreshToken) await logout(refreshToken);
    } catch {
      // Ignore — clear the local session regardless.
    } finally {
      clear();
      router.replace("/admin/login");
    }
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center border-b border-border/60 px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.map((item) => {
          const active =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-brand-gradient text-white shadow-brand"
                  : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 transition-transform duration-200 group-hover:scale-110",
                  active ? "text-white" : "text-muted-foreground group-hover:text-accent-foreground",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
