import { cn } from "@/lib/utils";
import type { ArenaStatus, BookingStatus, ComplaintStatus, PaymentStatus } from "@/types";

type Status =
  | ArenaStatus
  | BookingStatus
  | PaymentStatus
  | ComplaintStatus
  | "active"
  | "inactive";

const STYLES: Record<Status, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  pending_payment: "bg-amber-100 text-amber-700",
  pending_approval: "bg-amber-100 text-amber-700",
  // Wireframe (ArenaOwners.PNG screen 5): Confirmed green, Cancelled red.
  confirmed: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-slate-100 text-slate-600",
  // Wireframe (Admin.PNG screen 9): Open red, In Progress amber, Resolved green.
  open: "bg-red-100 text-red-700",
  under_review: "bg-amber-100 text-amber-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

const LABELS: Record<string, string> = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  pending_payment: "Pending Payment",
  pending_approval: "Pending Approval",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  refunded: "Refunded",
  open: "Open",
  under_review: "In Progress",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: Status }) {
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
