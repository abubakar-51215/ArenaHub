"use client";

/**
 * Admin console login — bright two-panel redesign ("login1"), same visual
 * language as the owner `login1`/`signup1` pages. Auth logic (admin-only
 * gate, mutation, store wiring, routing) is copied verbatim from
 * `admin/login/page.tsx` — only the presentation layer differs, and the
 * original `/admin/login` page is untouched and still works.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { SplitAuthShell } from "@/components/auth/split-auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, login } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

export default function AdminLogin1Page() {
  const router = useRouter();
  const { setSession, hydrated, user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    router.prefetch("/admin");
    if (hydrated && user?.role === "admin") router.replace("/admin");
  }, [hydrated, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await login(email, password);
      useAuthStore.getState().setTokens(tokens);
      const me = await fetchMe();
      if (me.role !== "admin") {
        useAuthStore.getState().clear();
        setError("This is the admin console. Please use an admin account.");
        return;
      }
      setSession(tokens, me);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SplitAuthShell
      variant="admin"
      imageSrc="/images/court-signup.jpg"
      imageAlt="Bright aerial view of a two-court tennis stadium"
      credit="Platform live now"
      quote={{
        eyebrow: "Arena Hub for admins",
        title: "Oversee the platform.",
        desc: "Verify arenas, manage owners, and keep ArenaHub trustworthy.",
      }}
      stats={[
        { value: "24/7", label: "Platform uptime" },
        { value: "99.9%", label: "Verification rate" },
        { value: "Live", label: "Monitor mode" },
      ]}
    >
      <h1 className="text-2xl font-bold text-foreground">Welcome Back!</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your admin account</p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="admin@arenahub.pk"
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

      <p className="mt-10 text-center text-xs text-muted-foreground">
        © 2026 Arena Hub. All rights reserved.
      </p>
    </SplitAuthShell>
  );
}
