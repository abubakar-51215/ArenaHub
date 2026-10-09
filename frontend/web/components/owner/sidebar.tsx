"use client";

/**
 * The owner rail, from the owner prototype (design/prototypes/
 * arena-hub-owner.html: .rail, .brand, .nav-*, .rail-foot .owner). It uses
 * the same classes as the admin rail (the two prototypes' rail CSS is
 * identical), so it gets the same 0.8-scaled styles under [data-admin].
 * Icons are the prototype's own; Equipment, Payments and Notifications have
 * no prototype icon and are drawn on the same 24px grid and stroke.
 * The rail foot is the owner card; it opens a small menu with Profile and
 * Log out (there is no separate logout button).
 */
import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";

import { useDashboardSummary } from "@/hooks/useDashboard";
import { useNotifications } from "@/hooks/useNotifications";
import { useIsDark } from "@/components/admin/topbar";
import { useArenaParam, withArena } from "@/hooks/useArenaParam";
import { toggleAdminTheme } from "@/lib/admin-theme";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  "aria-hidden": true,
} as const;

const ICONS = {
  board: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  ),
  bookings: (
    <svg {...svgProps} strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  schedule: (
    <svg {...svgProps} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  arenas: (
    <svg {...svgProps} strokeLinejoin="round">
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  courts: (
    <svg {...svgProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 10h3v4H3M21 10h-3v4h3" />
    </svg>
  ),
  equipment: (
    <svg {...svgProps} strokeLinejoin="round">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  ),
  pricing: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </svg>
  ),
  payments: (
    <svg {...svgProps} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
    </svg>
  ),
  revenue: (
    <svg {...svgProps} strokeLinecap="round">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
      <path d="M2.5 10.5h19M6.5 15h4" />
    </svg>
  ),
  reports: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </svg>
  ),
  reviews: (
    <svg {...svgProps} strokeLinejoin="round">
      <path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9Z" />
    </svg>
  ),
  notifications: (
    <svg {...svgProps}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  profile: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 6.1L4.2 6a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1A2 2 0 1 1 19.4 6l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.1 1.1Z" />
    </svg>
  ),
  theme: (
    <svg {...svgProps} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  ),
  logout: (
    <svg {...svgProps} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
} as const;

type IconName = keyof typeof ICONS;

export interface OwnerNavItem {
  label: string;
  href: string;
  icon: IconName;
  count?: "pendingBookings" | "unread";
}

/** Menu names and order as decided; groups follow the prototype's rail. */
export const OWNER_NAV: { label: string | null; items: OwnerNavItem[] }[] = [
  {
    label: "Today",
    items: [
      { label: "Live Board", href: "/owner", icon: "board" },
      { label: "Bookings", href: "/owner/bookings", icon: "bookings", count: "pendingBookings" },
      { label: "Schedule", href: "/owner/calendar", icon: "schedule" },
    ],
  },
  {
    label: "Venue",
    items: [
      { label: "Arenas", href: "/owner/arenas", icon: "arenas" },
      { label: "Courts", href: "/owner/courts", icon: "courts" },
      { label: "Equipment", href: "/owner/equipment", icon: "equipment" },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Pricing Rules", href: "/owner/pricing", icon: "pricing" },
      { label: "Payments", href: "/owner/payments", icon: "payments" },
      { label: "Revenue", href: "/owner/revenue", icon: "revenue" },
      { label: "Reports", href: "/owner/reports", icon: "reports" },
    ],
  },
  {
    label: "Reputation",
    items: [{ label: "Reviews", href: "/owner/reviews", icon: "reviews" }],
  },
  {
    label: null,
    items: [
      { label: "Notifications", href: "/owner/notifications", icon: "notifications", count: "unread" },
      { label: "Profile", href: "/owner/profile", icon: "profile" },
    ],
  },
];

export function OwnerBrandMark({ className = "ah-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1C2B23" />
      <path d="M9 22.5 16 8l7 14.5" stroke="#C4F546" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12.4 19h7.2" stroke="#C4F546" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="#C4F546" />
    </svg>
  );
}

function initials(name: string | undefined): string {
  if (!name) return "OW";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "OW";
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [arenaId] = useArenaParam();
  const { data: notifications } = useNotifications();
  const { data: summary } = useDashboardSummary();
  const counts = {
    pendingBookings: summary?.pending_approvals ?? 0,
    unread: notifications?.unread_count ?? 0,
  };
  const activeHref = OWNER_NAV.flatMap((g) => g.items)
    .map((i) => i.href)
    .filter((href) =>
      href === "/owner" ? pathname === "/owner" : pathname === href || pathname.startsWith(href + "/"),
    )
    .sort((x, y) => y.length - x.length)[0];

  return (
    <>
      {OWNER_NAV.map((group, gi) => (
        <nav key={group.label ?? `group-${gi}`} className="ah-nav-group">
          {group.label && <p className="ah-nav-label">{group.label}</p>}
          {group.items.map((item) => {
            const active = item.href === activeHref;
            const count = item.count ? counts[item.count] : 0;
            return (
              <Link
                key={item.href}
                href={withArena(item.href, arenaId)}
                onClick={onNavigate}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                className={cn("ah-nav-item", active && "is-active")}
              >
                {ICONS[item.icon]}
                <span>{item.label}</span>
                {count > 0 && (
                  <i
                    data-count
                    className="ah-nav-count"
                    title={
                      item.count === "pendingBookings"
                        ? `${count} booking${count === 1 ? "" : "s"} awaiting approval`
                        : `${count} unread notification${count === 1 ? "" : "s"}`
                    }
                  >
                    {count > 99 ? "99+" : count}
                  </i>
                )}
              </Link>
            );
          })}
        </nav>
      ))}
    </>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const dark = useIsDark();
  const { refreshToken, clear, user } = useAuthStore();
  const { data: summary } = useDashboardSummary();
  const arenas = summary?.total_arenas;

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
    <aside className="ah-rail">
      <Link href="/owner" className="ah-brand" onClick={onNavigate} aria-label="Arena Hub — go to Live Board">
        <OwnerBrandMark />
        <div className="ah-brand-name">
          Arena Hub<small>Owner console</small>
        </div>
      </Link>
      {/* the menu scrolls inside the rail when the window is too short for it;
          the owner card below stays pinned */}
      <div className="ah-rail-nav">
        <Suspense fallback={null}>
          <NavLinks onNavigate={onNavigate} />
        </Suspense>
      </div>
      <div className="ah-rail-foot">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="ah-owner ah-owner-btn" aria-label="Account menu">
              <span className="ah-owner-av">{initials(user?.full_name)}</span>
              <div className="min-w-0">
                <div className="ah-owner-name truncate">{user?.full_name ?? "Owner"}</div>
                <div className="ah-owner-role">
                  Owner{arenas !== undefined ? ` · ${arenas} arena${arenas === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="ah-menu" side="top" align="start" sideOffset={8}>
              <DropdownMenu.Item asChild className="ah-menu-item">
                <Link href="/owner/profile" onClick={onNavigate}>
                  {ICONS.profile}
                  Profile
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item className="ah-menu-item" onSelect={() => toggleAdminTheme()}>
                {ICONS.theme}
                {dark ? "Light theme" : "Dark theme"}
              </DropdownMenu.Item>
              <DropdownMenu.Item className="ah-menu-item" onSelect={() => void onLogout()}>
                {ICONS.logout}
                Log out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
}
