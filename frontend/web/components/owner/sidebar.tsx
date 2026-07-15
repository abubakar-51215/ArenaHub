"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  CalendarCheck,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  Star,
  Tag,
  Wallet,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
}

// In-scope routes have an href; the rest render as disabled placeholders so the
// shell matches the wireframe without implying features that aren't built yet.
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/owner", icon: LayoutDashboard },
  { label: "Arenas", href: "/owner/arenas", icon: Building2 },
  { label: "Courts", href: "/owner/courts", icon: LayoutGrid },
  { label: "Equipment", href: "/owner/equipment", icon: Dumbbell },
  { label: "Bookings", href: "/owner/bookings", icon: CalendarCheck },
  { label: "Calendar", href: "/owner/calendar", icon: CalendarDays },
  { label: "Pricing", href: "/owner/pricing", icon: Tag },
  { label: "Payment Config", href: "/owner/payments", icon: CreditCard },
  { label: "Earnings", href: "/owner/revenue", icon: Wallet },
  { label: "Reports", icon: BarChart3 },
  { label: "Reviews", href: "/owner/reviews", icon: Star },
  { label: "Profile", href: "/owner/profile", icon: Settings },
];

export function Sidebar() {
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
      router.replace("/login");
    }
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active =
            item.href &&
            (item.href === "/owner" ? pathname === "/owner" : pathname.startsWith(item.href));
          const Icon = item.icon;
          if (!item.href) {
            return (
              <span
                key={item.label}
                title="Coming in a later sprint"
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/50"
              >
                <Icon className="size-4" />
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-600 text-white" : "text-sidebar-foreground hover:bg-muted",
              )}
            >
              <Icon className="size-4" />
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
