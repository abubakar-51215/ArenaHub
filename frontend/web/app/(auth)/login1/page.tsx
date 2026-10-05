"use client";

/**
 * Owner login — bright two-panel redesign ("login1"): full-bleed HD court
 * photo on one side, form on the other, replacing the old `/login` page's
 * dark-overlay photo treatment with a brighter, more modern one.
 *
 * Auth logic (owner-only gate, mutation, store wiring, routing) is copied
 * verbatim from `login/page.tsx` — only the presentation layer differs, and
 * the original `/login` page is untouched and still works.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { SplitAuthShell } from "@/components/auth/split-auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, login } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

export default function Login1Page() {
  const router = useRouter();
  const { setSession, hydrated, user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Warm the dashboard route (compiles it ahead of time in dev) and skip the
  // form if already signed in as an owner.
  useEffect(() => {
    router.prefetch("/owner");
    if (hydrated && user?.role === "owner") router.replace("/owner");
  }, [hydrated, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await login(email, password);
      // Persist tokens first so fetchMe() sends the Authorization header.
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      if (me.role !== "owner") {
        useAuthStore.getState().clear();
        setError("This dashboard is for arena owners. Please use an owner account.");
        return;
      }
      setSession(tokens, me);
      router.replace("/owner");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SplitAuthShell
      imageSrc="/images/court-login.jpg"
      imageAlt="Vivid aerial view of a sunlit basketball court"
      badge="ArenaHub Owner Portal"
      caption={{
        title: "Manage. Grow. Thrive.",
        desc: "All your arenas, bookings and analytics in one place.",
      }}
    >
      <h1 className="text-2xl font-bold text-foreground">Welcome Back!</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your Arena Hub account</p>

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
            className="h-12 rounded-xl"
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
              className="h-12 rounded-xl pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="h-12 w-full rounded-xl bg-brand-gradient text-base text-white shadow-brand transition-all hover:opacity-95"
        >
          {submitting ? "Signing in…" : "Sign In"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup1" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
      <p className="mt-10 text-center text-xs text-muted-foreground">
        © 2026 Arena Hub. All rights reserved.
      </p>
    </SplitAuthShell>
  );
}
