import Link from "next/link";
import { ArrowRight, LayoutDashboard, ShieldCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-gradient-soft px-6 py-16">
      {/* Ambient brand glows */}
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="animate-fade-in-up relative flex w-full max-w-xl flex-col items-center text-center">
        <Logo className="scale-125" />
        <h1 className="mt-8 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Book. Play. <span className="text-gradient-brand">Manage.</span>
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground">
          Pakistan&apos;s sports arena booking and management platform — for players, arena owners,
          and administrators.
        </p>

        <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/login"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 text-sm font-semibold text-white shadow-brand transition-transform hover:-translate-y-0.5"
          >
            <LayoutDashboard className="size-4" />
            Owner Dashboard
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 text-sm font-semibold text-foreground shadow-card transition-colors hover:border-primary/30 hover:text-primary"
          >
            <ShieldCheck className="size-4" />
            Admin Console
          </Link>
        </div>
      </div>

      <p className="absolute bottom-6 text-xs text-muted-foreground">
        © 2026 Arena Hub. All rights reserved.
      </p>
    </main>
  );
}
