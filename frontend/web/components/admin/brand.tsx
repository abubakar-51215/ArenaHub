import Link from "next/link";

/**
 * Admin brand mark and name, copied from the admin prototype's `.brand` block
 * (design/prototypes/arena-hub-admin.html): a lime rounded square with an ink
 * "A", then "Arena Hub" over a small "Platform admin" line.
 */
export function AdminBrandMark({ className = "ah-brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#C4F546" />
      <path d="M9 22.5 16 8l7 14.5" stroke="#0F1A15" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M12.4 19h7.2" stroke="#0F1A15" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="#0F1A15" />
    </svg>
  );
}

/** The rail's brand block. It is a link to the Dashboard (/admin), reachable
 *  by keyboard; `onNavigate` closes the drawer on small screens. */
export function AdminBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/admin"
      className="ah-brand"
      onClick={onNavigate}
      aria-label="Arena Hub — go to Dashboard"
    >
      <AdminBrandMark />
      <div className="ah-brand-name">
        Arena Hub<small>Platform admin</small>
      </div>
    </Link>
  );
}
