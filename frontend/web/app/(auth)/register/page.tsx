"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, register, verifyOtp } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const fields = err.fieldErrors.map((f) => f.message).join(" ");
    return fields ? `${err.message}: ${fields}` : err.message;
  }
  return fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setSession, setTokens } = useAuthStore();

  const [step, setStep] = useState<"form" | "otp">("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await register({ full_name: fullName, email, phone, password });
      setStep("otp");
    } catch (err) {
      setError(errorMessage(err, "Registration failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await verifyOtp(email, code);
      // Persist tokens first so fetchMe() sends the Authorization header.
      setTokens(tokens);
      const me = await fetchMe();
      setSession(tokens, me);
      router.replace("/owner");
    } catch (err) {
      setError(errorMessage(err, "Verification failed. Please check the code and try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      {step === "form" ? (
        <>
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up your Arena Hub owner account to list and manage arenas.
          </p>

          <form onSubmit={onSubmitForm} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                autoComplete="name"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

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

            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="03001234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            <div>
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
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
              {submitting ? "Creating account…" : "Create Account"}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-foreground">Verify your email</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
            Enter it below to finish setting up your account.
          </p>

          <form onSubmit={onSubmitOtp} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                minLength={6}
                maxLength={6}
                required
                className="tracking-[0.3em]"
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
              disabled={submitting || code.length !== 6}
              className="h-11 w-full bg-brand-gradient text-white shadow-brand transition-all hover:opacity-95"
            >
              {submitting ? "Verifying…" : "Verify & Continue"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError(null);
              }}
              className="w-full text-center text-sm font-medium text-blue-600 hover:underline"
            >
              Wrong email? Go back
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
