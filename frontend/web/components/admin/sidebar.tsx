"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
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
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { useArenaQueue } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  /** null renders as an unlabelled section — see the same note in
   * components/owner/sidebar.tsx: only group items the prototype's IA
   * actually groups, rather than stretching a label to fit an extra. */
  label: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Oversight",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { label: "Bookings", href: "/admin/bookings", icon: CalendarCheck },
      { label: "Payments", href: "/admin/payments", icon: Wallet },
    ],
  },
  {
    label: "Directory",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Arena Owners", href: "/admin/owners", icon: UserCog },
      { label: "Arenas", href: "/admin/arenas", icon: Building2 },
    ],
  },
  {
    label: "Health",
    items: [
      { label: "Complaints", href: "/admin/complaints", icon: MessageSquareWarning },
      { label: "Reports", href: "/admin/reports", icon: BarChart3 },
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    label: null,
    items: [{ label: "Reviews", href: "/admin/reviews", icon: Star }],
  },
];

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshToken, clear } = useAuthStore();

  // Sidebar count badge for Arenas — cache-shares with the Arena
  // Verification page's queryKey ["admin-arenas","pending",1] when both are
  // mounted; fires its own fetch when the sidebar is the only consumer (any
  // admin page other than Arenas). Accepted: a missing count badge is worse
  // than the fetch cost.
  const { data: pendingQueue } = useArenaQueue("pending", 1);
  const pendingArenas = pendingQueue?.total;

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
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-4")}>
            {group.label && <p className="eyebrow px-3 pb-1.5">{group.label}</p>}
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                    {item.label === "Arenas" && !!pendingArenas && (
                      <span
                        title={`${pendingArenas} arena${pendingArenas === 1 ? "" : "s"} awaiting approval`}
                        className="rounded-full bg-warning-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning"
                      >
                        {pendingArenas}
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
