"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AdminBrand } from "@/components/admin/brand";
import { useArenaQueue } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

/* Nav icons are the admin prototype's own SVGs (24px grid, 1.9 stroke). */
const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  "aria-hidden": true,
} as const;

const ICONS = {
  overview: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  ),
  approvals: (
    <svg {...svgProps} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11.5 11.5 14l4.5-5" />
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </svg>
  ),
  bookings: (
    <svg {...svgProps} strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  payments: (
    <svg {...svgProps} strokeLinecap="round">
      <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
      <path d="M2.5 10.5h19M6.5 15h4" />
    </svg>
  ),
  players: (
    <svg {...svgProps} strokeLinecap="round">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a3 3 0 1 0-1.6-5.5M18 20a5.6 5.6 0 0 0-2-4.2" />
    </svg>
  ),
  owners: (
    <svg {...svgProps} strokeLinejoin="round">
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  complaints: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M12 8v4M12 14.5v.01" />
    </svg>
  ),
  analytics: (
    <svg {...svgProps} strokeLinecap="round">
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </svg>
  ),
  settings: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 6.1L4.2 6a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1A2 2 0 1 1 19.4 6l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.1 1.1Z" />
    </svg>
  ),
  // Reviews has no prototype screen; same grid and stroke, star outline.
  reviews: (
    <svg {...svgProps} strokeLinejoin="round">
      <path d="m12 3 2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8Z" />
    </svg>
  ),
  logout: (
    <svg {...svgProps} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
    </svg>
  ),
} as const;

type IconName = keyof typeof ICONS;

interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  count?: "pendingArenas";
}

interface NavGroup {
  /** null renders as an unlabelled section (Reviews has no prototype group). */
  label: string | null;
  items: NavItem[];
}

// Labels and order follow the admin prototype's rail; routes are unchanged.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Oversight",
    items: [
      { label: "Overview", href: "/admin", icon: "overview" },
      { label: "Approvals", href: "/admin/arenas", icon: "approvals", count: "pendingArenas" },
      { label: "Bookings", href: "/admin/bookings", icon: "bookings" },
      { label: "Payments", href: "/admin/payments", icon: "payments" },
    ],
  },
  {
    label: "Directory",
    items: [
      { label: "Players", href: "/admin/users", icon: "players" },
      { label: "Arena owners", href: "/admin/owners", icon: "owners" },
    ],
  },
  {
    label: "Health",
    items: [
      { label: "Complaints", href: "/admin/complaints", icon: "complaints" },
      { label: "Analytics", href: "/admin/reports", icon: "analytics" },
      { label: "System settings", href: "/admin/settings", icon: "settings" },
    ],
  },
  {
    label: null,
    items: [{ label: "Reviews", href: "/admin/reviews", icon: "reviews" }],
  },
];

function initials(name: string | undefined): string {
  if (!name) return "AD";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "AD";
}

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshToken, clear, user } = useAuthStore();

  // Pending-arena count for the Approvals badge — the same query the sidebar
  // already made before the restyle (cache-shared with the Approvals page).
  const { data: pendingQueue } = useArenaQueue("pending", 1);
  const counts = { pendingArenas: pendingQueue?.total };

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
    <aside className="ah-rail">
      <AdminBrand />
      {NAV_GROUPS.map((group, groupIndex) => (
        <nav key={group.label ?? `group-${groupIndex}`} className="ah-nav-group">
          {group.label && <p className="ah-nav-label">{group.label}</p>}
          {group.items.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const count = item.count ? counts[item.count] : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                className={cn("ah-nav-item", active && "is-active")}
              >
                {ICONS[item.icon]}
                <span>{item.label}</span>
                {!!count && (
                  <i
                    data-count
                    className="ah-nav-count"
                    title={`${count} arena${count === 1 ? "" : "s"} awaiting approval`}
                  >
                    {count}
                  </i>
                )}
              </Link>
            );
          })}
        </nav>
      ))}
      <div className="ah-rail-foot">
        <div className="ah-owner">
          <span className="ah-owner-av">{initials(user?.full_name)}</span>
          <div className="min-w-0">
            <div className="ah-owner-name truncate">{user?.full_name ?? "Admin"}</div>
            <div className="ah-owner-role">Admin</div>
          </div>
          <button type="button" onClick={onLogout} className="ah-logout" aria-label="Log out" title="Log out">
            {ICONS.logout}
          </button>
        </div>
      </div>
    </aside>
  );
}
