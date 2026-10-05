"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
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
import { useDashboardSummary } from "@/hooks/useDashboard";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Renders as a disabled placeholder (not yet built) instead of a link. */
  disabled?: boolean;
  disabledTooltip?: string;
}

interface NavGroup {
  /** null renders as an unlabelled section — for items that don't cleanly
   * belong to any of the labelled groups below (design/prototypes' IA only
   * covers a subset of this app's real nav; forcing every item into a
   * labelled group would stretch the labels past what they actually mean). */
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Today",
    items: [
      { label: "Dashboard", href: "/owner", icon: LayoutDashboard },
      { label: "Bookings", href: "/owner/bookings", icon: CalendarCheck },
      { label: "Calendar", href: "/owner/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Venue",
    items: [
      { label: "Arenas", href: "/owner/arenas", icon: Building2 },
      { label: "Courts", href: "/owner/courts", icon: LayoutGrid },
      { label: "Equipment", href: "/owner/equipment", icon: Dumbbell },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Pricing", href: "/owner/pricing", icon: Tag },
      { label: "Payment Config", href: "/owner/payments", icon: CreditCard },
      { label: "Earnings", href: "/owner/revenue", icon: Wallet },
    ],
  },
  {
    label: "Reputation",
    items: [{ label: "Reviews", href: "/owner/reviews", icon: Star }],
  },
  {
    label: null,
    items: [
      { label: "Notifications", href: "/owner/notifications", icon: Bell },
      { label: "Profile", href: "/owner/profile", icon: Settings },
      { label: "Reports", href: "/owner/reports", icon: BarChart3 },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshToken, clear } = useAuthStore();
  const { data: notifications } = useNotifications();
  const unread = notifications?.unread_count ?? 0;

  // Sidebar count badge for Bookings — first caller of useDashboardSummary
  // in the app. Adds one lightweight fetch per dashboard load; accepted
  // because a missing count badge is worse than the fetch cost.
  const { data: summary } = useDashboardSummary();
  const pendingBookings = summary?.pending_approvals;

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
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center border-b border-border/60 px-5">
        <Logo tone="dark" />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-4")}>
            {group.label && <p className="eyebrow px-3 pb-1.5">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href &&
                  (item.href === "/owner"
                    ? pathname === "/owner"
                    : pathname.startsWith(item.href));
                const Icon = item.icon;

                if (item.disabled || !item.href) {
                  return (
                    <span
                      key={item.label}
                      title={item.disabledTooltip}
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground"
                    >
                      <Icon className="size-4 text-muted-foreground/60" />
                      {item.label}
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-sidebar-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4 transition-transform duration-200 group-hover:scale-110",
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground group-hover:text-accent-foreground",
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.label === "Bookings" && !!pendingBookings && (
                      <span
                        title={`${pendingBookings} booking${pendingBookings === 1 ? "" : "s"} awaiting approval`}
                        className="rounded-full bg-warning-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning"
                      >
                        {pendingBookings}
                      </span>
                    )}
                    {item.label === "Notifications" && unread > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                          active
                            ? "bg-primary-foreground text-primary"
                            : "bg-primary text-primary-foreground",
                        )}
                      >
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
