"use client";

/**
 * Reset password in three steps on one page.
 *  1. The 6-digit code from the email (the shared code entry: six boxes,
 *     paste, the sixth digit opens step 2, "Send a new code in 0:42").
 *  2. A new password and its confirmation, with the live rule list and a
 *     show/hide button. This step sends email + code + password together:
 *     the API has no separate "check code" step, so a wrong, expired or
 *     used-up code is found here and the page goes back to step 1 with the
 *     server's own message, keeping the password that was typed.
 *  3. Done, with "Sign in".
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, CheckCircle2, Eye, EyeOff, X } from "lucide-react";

import { useCodeEntry } from "@/components/auth/use-code-entry";
import { FormMessage, ResetShell, StepLabel, plainError } from "@/components/auth/reset-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { forgotPassword, resetPassword } from "@/services/auth";
import { cn } from "@/lib/utils";


/** The same checks the server makes (validate_password_strength). */
const RULES: { label: string; ok: (p: string) => boolean }[] = [
  { label: "At least 8 characters", ok: (p) => p.length >= 8 },
  { label: "An upper-case letter", ok: (p) => /[A-Z]/.test(p) },
  { label: "A number", ok: (p) => /\d/.test(p) },
  { label: "A special character", ok: (p) => /[^A-Za-z0-9]/.test(p) },
  { label: "No more than 72 bytes", ok: (p) => new TextEncoder().encode(p).length <= 72 },
];

/** The server's messages about the code (backend app/shared/codes.py); they send the page back to step 1. */
function codeProblem(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  return /code is not right|too many wrong tries/i.test(err.message) ? err.message : null;
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const emailFromLink = !!params.get("email");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // the server keeps a 60 s wait between codes; arriving from "Send code" starts it
  const entry = useCodeEntry({
    firstWait: params.get("sent") ? 60 : 0,
    autoFocus: emailFromLink,
    onVerify: async () => {
      if (!email.trim()) throw new ApiError("Enter your email address first.", 422);
      setError(null);
      setStep(2);
    },
    onResend: () => {
      if (!email.trim()) return Promise.reject(new ApiError("Enter your email address first.", 422));
      return forgotPassword(email.trim());
    },
  });
  const code = entry.code;

  const rulesOk = RULES.every((r) => r.ok(password));
  const matches = password.length > 0 && password === confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email.trim(), code, password);
      setStep(3);
    } catch (err) {
      const problem = codeProblem(err);
      if (problem) {
        // back to the code, keeping the password that was typed
        entry.clearCode();
        setStep(1);
        entry.showError(problem);
      } else {
        setError(plainError(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 3) {
    return (
      <ResetShell>
        <StepLabel step={3} of={3} />
        <CheckCircle2 className="size-10 text-(--ok-text,#5d770b)" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Password changed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your new password is set and every device was signed out. Sign in with the new password to
          continue.
        </p>
        <Button size="lg" className="mt-6 h-11 w-full" onClick={() => router.replace("/login")}>
          Sign in
        </Button>
      </ResetShell>
    );
  }

  if (step === 2) {
    return (
      <ResetShell>
        <StepLabel step={2} of={3} />
        <h1 className="text-2xl font-bold text-foreground">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">For {email.trim()}.</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                className="pr-11"
                aria-describedby="password-rules"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <ul id="password-rules" className="space-y-1.5" aria-label="Password rules">
            {RULES.map((r) => {
              const ok = r.ok(password);
              return (
                <li
                  key={r.label}
                  className={cn("flex items-center gap-2 text-sm", ok ? "text-foreground" : "text-muted-foreground")}
                >
                  {ok ? (
                    <Check className="size-4 shrink-0 text-(--ok-text,#5d770b)" aria-hidden="true" />
                  ) : (
                    <X className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  {r.label}
                  <span className="sr-only">{ok ? " — done" : " — not yet"}</span>
                </li>
              );
            })}
          </ul>

          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {confirm.length > 0 && !matches && (
              <p className="mt-1.5 text-sm text-destructive">The two passwords do not match yet.</p>
            )}
          </div>

          {error && <FormMessage>{error}</FormMessage>}

          <Button type="submit" size="lg" disabled={submitting || !rulesOk || !matches} className="h-11 w-full">
            {submitting ? "Saving…" : "Set new password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            onClick={() => {
              setError(null);
              setStep(1);
            }}
          >
            Back to the code
          </Button>
        </form>
      </ResetShell>
    );
  }

  return (
    <ResetShell>
      <StepLabel step={1} of={3} />
      <h1 className="text-2xl font-bold text-foreground">Enter your code</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {emailFromLink ? (
          <>
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span> if it is
            registered. It works for 10 minutes.{" "}
            {/* the tap area is a 44px pseudo-element, so the link keeps the line's height */}
            <Link
              href="/forgot-password"
              className="relative font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']"
            >
              Use another email
            </Link>
          </>
        ) : (
          "Enter your email and the 6-digit code we sent you. A code works for 10 minutes."
        )}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          entry.confirm();
        }}
        className="mt-7 space-y-4"
      >
        {!emailFromLink && (
          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="owner@arenahub.pk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}

        {entry.boxes}

        <Button type="submit" size="lg" disabled={!entry.ready || !email.trim()} className="h-11 w-full">
          Continue
        </Button>

        <div className="flex items-center justify-center text-sm text-muted-foreground">{entry.resendLink}</div>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="inline-block min-w-11 py-3 text-center font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground"
        >
          Sign in
        </Link>
      </p>
    </ResetShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
