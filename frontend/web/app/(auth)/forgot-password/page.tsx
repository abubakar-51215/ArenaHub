"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { forgotPassword } from "@/services/auth";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"form" | "sent">("form");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      // The backend never reveals whether an email is registered, so this
      // step always shows regardless of the account's existence.
      setStep("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      {step === "form" ? (
        <>
          <h1 className="text-2xl font-bold text-foreground">Forgot your password?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a link to reset it.
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              className="h-11 w-full bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
            >
              {submitting ? "Sending…" : "Send Reset Link"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <MailCheck className="size-10 text-blue-600" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Check your email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            If <span className="font-medium text-foreground">{email}</span> is registered,
            we&apos;ve sent a link to reset your password. It expires in 30 minutes.
          </p>
          <Link href="/reset-password" className="mt-6 block">
            <Button size="lg" className="h-11 w-full bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95">
              I have my reset link
            </Button>
          </Link>
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Remembered your password?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
