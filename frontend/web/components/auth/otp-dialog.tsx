"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCodeEntry } from "@/components/auth/use-code-entry";

/** The code dialog shared by every "enter the 6-digit code we emailed" step on the web: the
 *  shared code entry (six boxes, sent at the sixth digit, the server's message under them,
 *  "Send a new code in 0:42"). A fresh entry each time it opens. Used by the owner's email,
 *  phone and password change, and by account deletion and bank-detail changes. */
export function OtpDialog({
  open,
  onOpenChange,
  title,
  description,
  onVerify,
  onResend,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onVerify: (code: string) => Promise<unknown>;
  onResend: () => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <OtpEntry onVerify={onVerify} onResend={onResend} onCancel={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function OtpEntry({
  onVerify,
  onResend,
  onCancel,
}: {
  onVerify: (code: string) => Promise<unknown>;
  onResend: () => Promise<unknown>;
  onCancel: () => void;
}) {
  const entry = useCodeEntry({ onVerify: async (code) => void (await onVerify(code)), onResend });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        entry.confirm();
      }}
      className="space-y-3"
    >
      {entry.boxes}
      <div className="flex justify-center text-sm text-muted-foreground">{entry.resendLink}</div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={entry.loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={entry.loading || !entry.ready}>
          {entry.loading ? "Confirming…" : "Confirm"}
        </Button>
      </DialogFooter>
    </form>
  );
}
