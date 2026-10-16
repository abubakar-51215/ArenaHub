import Link from "next/link";

import { ArenaMark } from "@/components/brand/arena-mark";

/**
 * Admin brand mark and name, copied from the admin prototype's `.brand` block
 * (design/prototypes/arena-hub-admin.html): a lime rounded square with an ink
 * "A", then "Arena Hub" over a small "Platform admin" line.
 */
export function AdminBrandMark({
  className = "ah-brand-mark",
  tone = "dark",
}: {
  className?: string;
  /** the rail is dark in both themes; the sign-in page follows the theme */
  tone?: "dark" | "theme";
}) {
  return <ArenaMark tone={tone} className={className} />;
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
