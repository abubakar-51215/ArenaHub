"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api";
import { fetchMe, login } from "@/services/auth";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
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
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex items-center justify-center px-6 py-10 sm:px-14 lg:px-20">
        <div className="w-full max-w-sm">
          <Logo className="mb-8" />
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
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <div className="mt-1.5 text-right">
                <a href="#" className="text-sm font-medium text-blue-600 hover:underline">
                  Forgot Password?
                </a>
              </div>
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
              className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <a href="#" className="font-medium text-blue-600 hover:underline">
              Sign up
            </a>
          </p>
          <p className="mt-10 text-center text-xs text-muted-foreground">
            © 2026 Arena Hub. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: branded arena photo */}
      <div
        className="relative hidden overflow-hidden bg-slate-950 lg:block"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(2,6,23,0.9) 0%, rgba(2,6,23,0.15) 40%, rgba(2,6,23,0.2) 100%), url('/images/login-arena.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-x-0 top-[62%] flex flex-col items-center px-14 text-center text-white">
          <h2 className="text-3xl font-bold">Manage. Grow. Thrive.</h2>
          <p className="mt-2 max-w-sm text-sm text-white/70">
            All your arenas, bookings and analytics in one place.
          </p>
        </div>
      </div>
    </main>
  );
}
