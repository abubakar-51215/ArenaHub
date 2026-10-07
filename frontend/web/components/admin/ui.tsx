/**
 * Admin building blocks in the admin prototype's style
 * (design/prototypes/arena-hub-admin.html). Styles live in globals.css under
 * [data-admin]; these components only supply the prototype's markup.
 */
import { cn } from "@/lib/utils";

/* ---- status badge ----------------------------------------------------------
   Prototype colours carry meaning: lime-deep = done/ok, amber = waiting,
   red = stopped or failed, grey = idle. */
type Tone = "ok" | "wait" | "off" | "idle";

const TONE: Record<string, Tone> = {
  // bookings
  confirmed: "ok",
  completed: "ok",
  pending_payment: "wait",
  pending_approval: "wait",
  cancelled: "off",
  rejected: "off",
  no_show: "off",
  // payments
  paid: "ok",
  pending: "wait",
  processing: "wait",
  failed: "off",
  refunded: "off",
  partially_refunded: "wait",
  // arenas
  approved: "ok",
  // complaints
  open: "off",
  under_review: "wait",
  in_progress: "wait",
  resolved: "ok",
  closed: "idle",
  // accounts
  active: "ok",
  suspended: "off",
  inactive: "idle",
};

const LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  pending_approval: "Pending approval",
  under_review: "Under review",
  in_progress: "In progress",
  partially_refunded: "Part refunded",
  no_show: "No-show",
};

export function statusLabel(status: string): string {
  return LABEL[status] ?? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export function AdminBadge({
  status,
  tone,
  children,
}: {
  status?: string;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  const t = tone ?? (status ? (TONE[status] ?? "idle") : "idle");
  return <span className={cn("ah-badge", `ah-b-${t}`)}>{children ?? (status ? statusLabel(status) : null)}</span>;
}

/* ---- tag, avatar ------------------------------------------------------------ */
export function AdminTag({ children }: { children: React.ReactNode }) {
  return <span className="ah-tag">{children}</span>;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function AdminAvatar({ name }: { name: string | null | undefined }) {
  return (
    <span className="ah-avatar" data-avatar aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Avatar + name in one cell, as in the prototype's player and booking rows. */
export function AdminPerson({ name, sub }: { name: string; sub?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <AdminAvatar name={name} />
      <div className="min-w-0">
        <div className="ah-strong truncate">{name}</div>
        {sub && <div className="ah-sub truncate">{sub}</div>}
      </div>
    </div>
  );
}

/* ---- cards ------------------------------------------------------------------ */
export function AdminCard({
  title,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("ah-card", className)}>
      {(title || actions) && (
        <div className="ah-card-head">
          {title && <h2 className="ah-h2">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function AdminKpi({
  label,
  value,
  foot,
  tone,
  size = "sm",
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone?: "wait" | "off";
  /** "lg" is the prototype's overview `.metric` (38px); "sm" its `.metric.sm` (26px) */
  size?: "sm" | "lg";
}) {
  return (
    <div className="ah-card ah-kpi">
      <p className="ah-eyebrow">{label}</p>
      <div
        className={cn("ah-metric", size === "lg" && "is-lg")}
        style={tone === "wait" ? { color: "var(--amber)" } : tone === "off" ? { color: "var(--red)" } : undefined}
      >
        {value}
      </div>
      {foot && <div className="ah-kpi-foot">{foot}</div>}
    </div>
  );
}

/* ---- empty state, table footer, pager ---------------------------------------- */
export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="ah-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="M3 9h18M8 14h8" strokeLinecap="round" />
      </svg>
      <p className="m-0">{children}</p>
    </div>
  );
}

/** "Showing x–y of N" line under a table, with the prototype pager when the
 *  list already pages (pass `page`, `pageCount` and `onPage`). */
export function AdminTableFoot({
  from,
  to,
  total,
  page,
  pageCount,
  onPage,
}: {
  from: number;
  to: number;
  total: number;
  page?: number;
  pageCount?: number;
  onPage?: (page: number) => void;
}) {
  // the prototype always shows the pager, even for a single page (‹ 1 ›)
  const pages = pageCount && pageCount >= 1 ? pagerItems(page ?? 1, pageCount) : [];
  return (
    <div className="ah-tbl-foot" data-table-foot>
      <span>
        Showing {total === 0 ? 0 : from}–{to} of {total.toLocaleString("en-US")}
      </span>
      {pages.length > 0 && onPage && page && pageCount && (
        <div className="ah-pager" data-pager>
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ‹
          </button>
          {pages.map((p, i) =>
            p === "…" ? (
              <button key={`gap-${i}`} type="button" disabled aria-hidden="true">
                …
              </button>
            ) : (
              <button
                key={p}
                type="button"
                className={cn(p === page && "is-on")}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

function pagerItems(page: number, count: number): (number | "…")[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  const set = new Set([1, 2, 3, page - 1, page, page + 1, count].filter((p) => p >= 1 && p <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Field wrapper: prototype `.field` (label above control, 6px gap). */
export function AdminField({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("ah-field", className)}>{children}</div>;
}
