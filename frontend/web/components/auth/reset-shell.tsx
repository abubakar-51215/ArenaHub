import type { ReactNode } from "react";

import { SplitAuthShell } from "@/components/auth/split-auth-shell";
import { ApiError } from "@/services/api";

/** The split sign-in shell as the owner sign-in page uses it, for the
 *  forgot-password and reset-password screens. */
export function ResetShell({ children }: { children: ReactNode }) {
  return (
    <SplitAuthShell
      variant="owner"
      imageSrc="/images/court-login.jpg"
      imageAlt=""
      credit="Owner console"
      quote={{
        eyebrow: "Arena Hub for owners",
        title: (
          <>
            Back on the board <em>in a minute.</em>
          </>
        ),
        desc: "We email you a 6-digit code. Enter it, choose a new password, and sign in again.",
      }}
      stats={[
        { value: "6", label: "Digit code" },
        { value: "10 min", label: "Code lifetime" },
        { value: "1", label: "Code at a time" },
      ]}
    >
      {children}
    </SplitAuthShell>
  );
}

/** "Step 1 of 3"-style eyebrow above a step's heading. */
export function StepLabel({ step, of }: { step: number; of: number }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      Step {step} of {of}
    </p>
  );
}

/** A server or form message inside the page, in the sign-in pages' style. */
export function FormMessage({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
      }
    >
      {children}
    </p>
  );
}

export const SENT_MESSAGE = "If this email is registered, we have sent a 6-digit code.";

/** A failed call in plain words: the server's own message, or what to do. */
export function plainError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Too many requests from this device. Wait a minute and try again.";
    return err.message;
  }
  return "We could not reach Arena Hub. Check your connection and try again.";
}
