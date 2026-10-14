/** A status as the owner and admin screens word it ("Awaiting payment", "Confirmed", "Refunded"). */
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
