import { cn } from "@/lib/utils";
import type { ArenaStatus, BookingStatus, ComplaintStatus, PaymentStatus } from "@/types";

export type Status =
  | ArenaStatus
  | BookingStatus
  | PaymentStatus
  | ComplaintStatus
  | "active"
  | "inactive"
  | "suspended"
  | "removed";

export const STYLES: Record<Status, string> = {
  approved: "bg-success-muted text-success",
  pending: "bg-warning-muted text-warning",
  rejected: "bg-danger-muted text-destructive",
  active: "bg-success-muted text-success",
  inactive: "bg-muted text-muted-foreground",
  // set by an admin (owner Arenas list)
  suspended: "bg-danger-muted text-destructive",
  removed: "bg-muted text-muted-foreground",
  pending_payment: "bg-warning-muted text-warning",
  pending_approval: "bg-warning-muted text-warning",
  // Wireframe (ArenaOwners.PNG screen 5): Confirmed green, Cancelled red.
  confirmed: "bg-success-muted text-success",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-danger-muted text-destructive",
  failed: "bg-danger-muted text-destructive",
  refunded: "bg-muted text-muted-foreground",
  // Wireframe (Admin.PNG screen 9): Open red, In Progress amber, Resolved green.
  open: "bg-danger-muted text-destructive",
  under_review: "bg-warning-muted text-warning",
  resolved: "bg-success-muted text-success",
};

export const LABELS: Record<string, string> = {
  approved: "Approved",
  pending: "Pending",
  rejected: "Rejected",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  removed: "Removed",
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
        "inline-flex items-center gap-[5px] rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      <span className="size-[5px] rounded-full bg-current" />
      {LABELS[status]}
    </span>
  );
}
