"use client";

/**
 * Forgot password: one email field and "Send code". After sending, the page
 * shows the same message whether or not the email is registered (the
 * server answers the same way for both), then leads on to the code step.
 */
import { useState } from "react";
import Link from "next/link";

import { FormMessage, ResetShell, SENT_MESSAGE, plainError } from "@/components/auth/reset-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPassword } from "@/services/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(plainError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const next = `/reset-password?email=${encodeURIComponent(email.trim())}&sent=1`;

  return (
    <ResetShell>
      <h1 className="text-2xl font-bold text-foreground">Forgot your password?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter your email and we&apos;ll send you a 6-digit code to reset it.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <div>
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="owner@arenahub.pk"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSent(false);
            }}
            required
          />
        </div>

        {error && <FormMessage>{error}</FormMessage>}
        {sent && <FormMessage tone="info">{SENT_MESSAGE}</FormMessage>}

        {sent ? (
          <Button asChild size="lg" className="h-11 w-full">
            <Link href={next}>Enter the code</Link>
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={submitting} className="h-11 w-full">
            {submitting ? "Sending…" : "Send code"}
          </Button>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link
          href="/login"
          className="inline-block font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground max-md:py-3"
        >
          Sign in
        </Link>
      </p>
    </ResetShell>
  );
}
