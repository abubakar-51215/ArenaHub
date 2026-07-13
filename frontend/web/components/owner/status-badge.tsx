import { cn } from "@/lib/utils";
import type { ArenaStatus } from "@/types";

const STYLES: Record<ArenaStatus | "active" | "inactive", string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
};

const LABELS: Record<string, string> = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
};

export function StatusBadge({ status }: { status: ArenaStatus | "active" | "inactive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {LABELS[status]}
    </span>
  );
}
