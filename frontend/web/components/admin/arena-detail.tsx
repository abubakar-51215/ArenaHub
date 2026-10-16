"use client";

/**
 * Read-only arena details for the admin (Approvals "View", and the Arenas
 * page). Everything shown is on the arena record the lists already return,
 * so opening it makes no request. Label/value pairs use the `.ah-detail`
 * list from the user View dialog.
 */
import { AdminBadge } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import type { Arena } from "@/types";

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ArenaDetailDialog({
  arena,
  onOpenChange,
  actions,
}: {
  arena: Arena | null;
  onOpenChange: (open: boolean) => void;
  /** extra footer buttons, e.g. Approve / Reject on the Approvals page */
  actions?: React.ReactNode;
}) {
  return (
    <Dialog open={!!arena} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{arena?.name}</DialogTitle>
          <DialogDescription>
            {arena ? [arena.area, arena.city].filter(Boolean).join(", ") : ""}
          </DialogDescription>
        </DialogHeader>
        {arena && (
          <dl className="ah-detail">
            <dt>Status</dt>
            <dd>
              <AdminBadge status={arena.status} />
              {!arena.is_active && <span className="ah-sub"> · taken offline by the owner</span>}
            </dd>
            {arena.status === "rejected" && arena.rejection_reason && (
              <>
                <dt>Reason</dt>
                <dd>{arena.rejection_reason}</dd>
              </>
            )}
            <dt>Address</dt>
            <dd>{arena.address}</dd>
            <dt>Sports</dt>
            <dd>{arena.sports_offered.map(titleCase).join(", ") || "—"}</dd>
            <dt>Phone</dt>
            <dd className="tabular-nums">{arena.contact_phone || "—"}</dd>
            <dt>Email</dt>
            <dd>{arena.contact_email || "—"}</dd>
            <dt>Photos</dt>
            <dd className="tabular-nums">{arena.images.length}</dd>
            <dt>Advance</dt>
            <dd className="tabular-nums">
              {arena.require_full_payment ? "Full payment" : `${arena.advance_percentage}%`}
            </dd>
            <dt>Submitted</dt>
            <dd className="tabular-nums">{formatDate(arena.created_at.slice(0, 10))}</dd>
            {arena.description && (
              <>
                <dt>About</dt>
                <dd>{arena.description}</dd>
              </>
            )}
          </dl>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
