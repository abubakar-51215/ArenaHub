"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBankDetails } from "@/hooks/useBankDetails";
import { formatDate, formatRs, formatTime } from "@/lib/format";
import { isSafeMediaUrl } from "@/lib/safe-media-url";
import type { OwnerBookingRow } from "@/types";

/** Read-only verification panel: the receipt image next to the arena's own
 * bank details, so the owner can check the transferred-to account matches
 * before approving/rejecting — without leaving the bookings table. */
export function ReceiptReviewDialog({
  row,
  onOpenChange,
}: {
  row: OwnerBookingRow | null;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: bankAccounts } = useBankDetails(row?.arena_id ?? null);
  // Show the default account (or the first) as the one the player most likely
  // transferred to.
  const bankDetails = bankAccounts?.find((a) => a.is_default) ?? bankAccounts?.[0] ?? null;

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verify Bank Transfer</DialogTitle>
          <DialogDescription>
            {row ? `#BK-${row.booking_id.slice(0, 4).toUpperCase()} — ${row.player_name}` : ""}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-medium text-foreground">{formatRs(row.total_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="font-medium text-foreground">
                  {formatDate(row.booking_date)} {formatTime(row.start_time)}
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground">
                Your bank details (shown to the player)
              </p>
              {bankDetails ? (
                <>
                  <p>
                    <span className="text-muted-foreground">Bank:</span> {bankDetails.bank_name}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Title:</span>{" "}
                    {bankDetails.account_title}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Account #:</span>{" "}
                    {bankDetails.account_number}
                  </p>
                  {bankDetails.iban && (
                    <p>
                      <span className="text-muted-foreground">IBAN:</span> {bankDetails.iban}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  No bank details on file for this arena yet — set them under Payment Config.
                </p>
              )}
            </div>

            {row.receipt_proof_url && isSafeMediaUrl(row.receipt_proof_url) ? (
              // eslint-disable-next-line @next/next/no-img-element -- external/Cloudinary receipt URL, not a local asset
              <img
                src={row.receipt_proof_url}
                alt="Uploaded payment receipt"
                className="max-h-96 w-full rounded-lg border border-border object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {row.receipt_proof_url
                  ? "Receipt URL could not be verified."
                  : "No receipt uploaded."}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
