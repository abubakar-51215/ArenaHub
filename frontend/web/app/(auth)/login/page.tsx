"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { afterLogin } from "@/lib/after-login";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { saveStep } from "@/components/auth/signup-step";
import { SplitAuthShell } from "@/components/auth/split-auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import {
  fetchMe,
  isAdminChallenge,
  loginWithIdentifier,
  type VerifyEmailData,
} from "@/services/auth";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const { setSession, hydrated, user } = useAuthStore();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Skip the form if already signed in. (No router.prefetch here: it runs before the
  // session cookie exists, so the middleware's redirect gets cached and reused after login.)
  useEffect(() => {
    if (hydrated && user?.role === "owner") router.replace(afterLogin("/owner"));
  }, [hydrated, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginWithIdentifier(identifier.trim(), password);
      if (isAdminChallenge(result)) {
        // an admin account: it signs in on the admin page, with a code
        setError("This dashboard is for arena owners. Please use an owner account.");
        return;
      }
      const tokens = result;
      // Persist tokens first so fetchMe() sends the Authorization header.
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      if (me.role !== "owner") {
        useAuthStore.getState().clear();
        setError("This dashboard is for arena owners. Please use an owner account.");
        return;
      }
      setSession(tokens, me);
      router.replace(afterLogin("/owner"));
    } catch (err) {
      // the email is not confirmed yet: the server sent a fresh code (or says why it could not); the code step opens
      const verify =
        err instanceof ApiError && err.status === 403 ? (err.data as VerifyEmailData | null) : null;
      if (verify?.email) {
        saveStep({
          email: verify.email,
          sentTo: verify.sent_to,
          codeSent: verify.code_sent,
          at: Date.now(),
        });
        router.push("/register");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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
            Every court, every hour, <em>in one view.</em>
          </>
        ),
        desc: "Track tonight's bookings as they land, approve requests in a tap, and watch your occupancy climb.",
      }}
      stats={[
        { value: "Live", label: "Booking board" },
        { value: "Instant", label: "Booking approvals" },
        { value: "Local", label: "Payment methods" },
      ]}
    >
      <h1 className="text-2xl font-bold text-foreground">Welcome Back!</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your Arena Hub account</p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <div>
          <Label htmlFor="identifier">Email or phone</Label>
          <Input
            id="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="owner@arenahub.pk or 0300 1234567"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground max-md:w-11 coarse:w-11 max-md:justify-center coarse:justify-center max-md:pr-0 coarse:pr-0"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="inline-block text-sm font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground py-1 max-md:py-3 coarse:py-3"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" size="lg" disabled={submitting} className="h-11 w-full">
          {submitting ? "Signing in…" : "Sign In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="inline-block py-1 font-medium text-foreground underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground"
        >
          Sign up
        </Link>
      </p>
      <p className="mt-10 text-center text-xs text-muted-foreground">
        © 2026 Arena Hub. All rights reserved.
      </p>
    </SplitAuthShell>
  );
}
