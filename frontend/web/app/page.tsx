"use client";

/**
 * Root landing page — the marketing page previously built at `/home` (nav,
 * hero, features, sports strip, stats, owner section, final CTA, footer),
 * now living at the actual site entry point and wrapped in the same
 * floating-card treatment (margin from the viewport edge, rounded corners,
 * Bootstrap-primary→white gradient backdrop) as before.
 *
 * This app is a management console for arena owners and platform
 * administrators only (players use the mobile app), so every section's copy
 * is written for that audience — no player-facing booking language.
 *
 * The header is a normal (non-fixed) top section rather than sticky/fixed:
 * `position: sticky` breaks under an `overflow: hidden` ancestor (needed
 * here for the rounded corners), so this trades the scroll-shadow nav for a
 * layout that reliably clips to a rounded card.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Menu,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Volleyball,
  Wallet,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Sports", href: "#sports" },
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "For Owners", href: "#owners" },
];

const SPORTS = ["Padel", "Futsal", "Cricket", "Football", "Badminton", "Tennis"];

const HERO_SLIDES = [
  {
    tag: "OWNER DASHBOARD",
    title: (
      <>
        Manage Every Court,
        <br /> <span className="text-gradient-marketing">All in One Place</span>
      </>
    ),
    desc: "Live bookings, staff, pricing, and payouts for every arena you run — from a single dashboard.",
  },
  {
    tag: "PLATFORM OVERSIGHT",
    title: (
      <>
        Verify Arenas.
        <br /> <span className="text-gradient-marketing">Keep It Trustworthy.</span>
      </>
    ),
    desc: "Review new owners, monitor bookings platform-wide, and resolve complaints from the admin console.",
  },
  {
    tag: "REAL-TIME CONTROL",
    title: (
      <>
        Fill Every Slot.
        <br /> <span className="text-gradient-marketing">Grow</span> Every Month.
      </>
    ),
    desc: "Track occupancy, revenue, and reviews in real time — and act on what you see.",
  },
];

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Real-Time Occupancy",
    desc: "Live booking and slot activity across every court, updated the instant something changes.",
  },
  {
    icon: Wallet,
    title: "Revenue & Payouts",
    desc: "Track earnings as they come in and withdraw via bank transfer, JazzCash, or EasyPaisa.",
  },
  {
    icon: Users,
    title: "Staff & Access Control",
    desc: "Add staff accounts and control who can manage bookings, pricing, and equipment.",
  },
  {
    icon: ShieldCheck,
    title: "Arena Verification",
    desc: "Admins review and approve new arenas before they go live on the platform.",
  },
  {
    icon: Star,
    title: "Reviews & Disputes",
    desc: "Monitor customer feedback and resolve complaints platform-wide.",
  },
  {
    icon: QrCode,
    title: "Equipment & Check-in",
    desc: "Track rental equipment and QR check-ins across every court you manage.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "List Your Arena",
    desc: "Add your courts, set pricing, and go live after a quick verification.",
  },
  {
    n: "02",
    title: "Manage From One Dashboard",
    desc: "Handle bookings, staff, and equipment without a single phone call.",
  },
  {
    n: "03",
    title: "Get Paid, Track Growth",
    desc: "Withdraw revenue and watch occupancy climb with real-time analytics.",
  },
];

const STATS = [
  { icon: Calendar, value: "Instant booking", label: "No double bookings, ever" },
  { icon: Wallet, value: "Local payments", label: "JazzCash, EasyPaisa and cards" },
  { icon: Users, value: "Matchmaking", label: "Find players to play with" },
  { icon: Volleyball, value: "Equipment rental", label: "Add gear when you book" },
  { icon: Sparkles, value: "Smart picks", label: "Arenas suggested for you" },
];

function AboutDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>About ArenaHub</DialogTitle>
          <DialogDescription>Pakistan&apos;s sports arena management platform</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            ArenaHub is a centralized sports-arena booking and management platform for Pakistan,
            replacing the manual phone-call-and-WhatsApp way of running a court business with a
            real-time digital system.
          </p>
          <p>
            Players book courts in real time from the ArenaHub mobile app.{" "}
            <span className="font-medium text-foreground">This web console</span> is where{" "}
            <span className="font-medium text-foreground">arena owners</span> manage their courts,
            pricing, staff, and revenue, and where{" "}
            <span className="font-medium text-foreground">administrators</span> verify arenas and
            keep the platform trustworthy.
          </p>
        </div>
        <DialogFooter>
          <Link href="/register" className="w-full sm:w-auto">
            <Button className="w-full bg-accent text-accent-foreground shadow-xs hover:bg-accent/90">
              Register as Owner
            </Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ trigger }: { trigger: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Get in Touch</DialogTitle>
          <DialogDescription>We usually reply within one business day.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <a
            href="mailto:info@arenahub.pk"
            className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-accent"
          >
            <Mail className="size-4 text-primary" />
            <span className="text-foreground">info@arenahub.pk</span>
          </a>
          <a
            href="tel:+923001234567"
            className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-accent"
          >
            <Phone className="size-4 text-primary" />
            <span className="text-foreground">+92 300 1234567</span>
          </a>
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <MapPin className="size-4 text-primary" />
            <span className="text-foreground">Lahore, Pakistan</span>
          </div>
        </div>
        <DialogFooter>
          <a href="mailto:info@arenahub.pk" className="w-full sm:w-auto">
            <Button className="w-full bg-accent text-accent-foreground shadow-xs hover:bg-accent/90">
              Email Us
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 6000);
    return () => clearInterval(t);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  const activeSlide = HERO_SLIDES[slide];

  return (
    <div
      data-theme="arena"
      className="min-h-screen p-3 sm:p-6"
      style={{ background: "linear-gradient(135deg, var(--foreground) 0%, var(--background) 100%)" }}
    >
      <div className="mx-auto overflow-hidden rounded-3xl bg-background text-foreground shadow-2xl">
        {/* ---------------------------------------------------------------- */}
        {/* Nav                                                               */}
        {/* ---------------------------------------------------------------- */}
        <header className="relative z-40 border-b border-border">
          <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
            <a href="#home" className="shrink-0">
              <Logo />
            </a>

            <div className="hidden items-center gap-7 lg:flex">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
              <AboutDialog
                trigger={
                  <button className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    About
                  </button>
                }
              />
              <ContactDialog
                trigger={
                  <button className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    Contact
                  </button>
                }
              />
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <Link
                href="/admin/login"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ShieldCheck className="size-3.5" />
                Admin
              </Link>
              <Link
                href="/login"
                className="inline-flex h-9 max-md:h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="group inline-flex h-9 max-md:h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-xs transition-transform hover:-translate-y-0.5 hover:bg-accent/90"
              >
                Get Started
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex size-9 max-md:size-11 items-center justify-center rounded-lg text-foreground lg:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </nav>

          {menuOpen && (
            <div className="animate-fade-in-up border-t border-border bg-background px-6 py-4 lg:hidden">
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="rounded-lg px-2 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                  >
                    {link.label}
                  </a>
                ))}
                <AboutDialog
                  trigger={
                    <button className="rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent">
                      About
                    </button>
                  }
                />
                <ContactDialog
                  trigger={
                    <button className="rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground hover:bg-accent">
                      Contact
                    </button>
                  }
                />
              </div>
              <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
                <Link
                  href="/admin/login"
                  onClick={closeMenu}
                  className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground"
                >
                  <ShieldCheck className="size-3.5" />
                  Admin Console
                </Link>
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border text-sm font-semibold text-foreground"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  onClick={closeMenu}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-accent text-sm font-semibold text-accent-foreground shadow-xs"
                >
                  Get Started
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}
        </header>

        {/* ---------------------------------------------------------------- */}
        {/* Hero — bright, two-column, blob-framed photo                     */}
        {/* ---------------------------------------------------------------- */}
        <section id="home" className="relative overflow-hidden bg-secondary py-16 sm:py-24">
          <div className="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-foreground/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 top-1/3 size-96 rounded-full bg-accent/20 blur-3xl" />
          <div
            className="pointer-events-none absolute top-8 right-[6%] size-32 opacity-40"
            style={{
              backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
              backgroundSize: "16px 16px",
              color: "var(--accent)",
            }}
          />

          <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-2">
            {/* Copy */}
            <div className="animate-fade-in-up">
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-background/80 px-4 py-1.5 text-xs font-bold tracking-widest text-foreground shadow-card backdrop-blur-sm">
                {activeSlide.tag}
              </span>
              <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight text-foreground sm:text-6xl">
                {activeSlide.title}
              </h1>
              <p className="mt-5 max-w-lg text-base text-muted-foreground sm:text-lg">
                {activeSlide.desc}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-bold text-accent-foreground shadow-xs transition-transform hover:-translate-y-0.5 hover:bg-accent/90"
                >
                  Register Your Arena
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-border bg-background px-7 text-sm font-bold text-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  Sign In
                </Link>
              </div>

              {/* Slide controls */}
              <div className="mt-14 flex items-center gap-5">
                <button
                  aria-label="Previous slide"
                  onClick={() => setSlide((s) => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)}
                  className="flex size-9 max-md:size-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="flex items-center gap-2">
                  {HERO_SLIDES.map((s, i) => (
                    <button
                      key={s.tag}
                      aria-label={`Go to slide ${i + 1}`}
                      onClick={() => setSlide(i)}
                      className={`flex size-8 max-md:size-11 items-center justify-center rounded-full text-xs font-bold transition-all ${
                        i === slide
                          ? "bg-accent text-accent-foreground shadow-xs"
                          : "border border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  aria-label="Next slide"
                  onClick={() => setSlide((s) => (s + 1) % HERO_SLIDES.length)}
                  className="flex size-9 max-md:size-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Blob-framed photo */}
            <div className="animate-fade-in-up relative mx-auto w-full max-w-md [animation-delay:0.1s] lg:max-w-none">
              <div className="absolute inset-0 -rotate-6 rounded-[3rem] bg-accent opacity-90" />
              <div className="relative overflow-hidden rounded-[3rem] shadow-card">
                <Image
                  src="/images/hero-arena-bright.jpg"
                  alt="Vivid floodlit sports court, ready for play"
                  width={700}
                  height={584}
                  priority
                  className="aspect-[6/5] w-full object-cover saturate-110"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-transparent" />
              </div>

              {/* Floating ball badge */}
              <div className="animate-fade-in absolute -top-5 -right-5 flex size-20 rotate-6 items-center justify-center rounded-3xl bg-background shadow-card [animation-delay:0.3s] sm:-right-8">
                <Volleyball className="size-9 text-foreground" />
              </div>

              {/* Floating live-activity chip */}
              <div className="animate-fade-in absolute -bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-background px-5 py-3 shadow-card [animation-delay:0.4s] sm:left-8 sm:translate-x-0">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
                <span className="text-sm font-bold text-foreground">38 bookings today</span>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Sports strip                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section id="sports" className="border-y border-border bg-card py-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6">
            <span className="text-xs font-bold tracking-widest text-muted-foreground">
              SPORTS YOU CAN LIST
            </span>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {SPORTS.map((sport) => (
                <span
                  key={sport}
                  className="rounded-full bg-muted px-4 py-1.5 text-sm font-semibold text-muted-foreground"
                >
                  {sport}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Features                                                          */}
        {/* ---------------------------------------------------------------- */}
        <section id="features" className="bg-background py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="eyebrow eyebrow-marketing">FEATURES</span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Everything running an arena needs,{" "}
                <span className="text-gradient-marketing">built in</span>
              </h2>
            </div>

            <div className="stagger mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="card-elevated group relative overflow-hidden rounded-2xl border border-border bg-card p-6"
                >
                  <div className="flex size-11 items-center justify-center rounded-xl bg-accent shadow-xs">
                    <f.icon className="size-5 text-accent-foreground" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* How it works                                                      */}
        {/* ---------------------------------------------------------------- */}
        <section id="how-it-works" className="bg-secondary py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-xl text-center">
              <span className="eyebrow eyebrow-marketing">HOW IT WORKS</span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                From listing to earning in three steps
              </h2>
            </div>

            <div className="stagger mt-14 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.n} className="relative text-center">
                  <span className="text-gradient-marketing text-6xl font-black opacity-50">{step.n}</span>
                  <h3 className="mt-2 text-lg font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Stats                                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-background py-16">
          <div className="stagger mx-auto flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-10 px-6">
            {STATS.map((stat) => (
              <div key={stat.label} className="w-[calc(50%-1rem)] text-center sm:w-[calc(33.333%-1.4rem)]">
                <stat.icon className="mx-auto size-5 text-muted-foreground" />
                <div className="mt-2 text-xl font-extrabold text-foreground sm:text-2xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Owner CTA — bright dashboard-mockup card instead of a photo       */}
        {/* ---------------------------------------------------------------- */}
        <section id="owners" className="relative overflow-hidden bg-card py-24">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2">
            <div>
              <span className="eyebrow eyebrow-marketing">
                FOR ARENA OWNERS
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Own an arena? <span className="text-gradient-marketing">Put it on the map.</span>
              </h2>
              <ul className="mt-6 space-y-3">
                {[
                  "List your courts and pricing in minutes",
                  "Manage bookings, staff, and equipment from one dashboard",
                  "Track revenue with downloadable reports",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-bold text-accent-foreground shadow-xs transition-transform hover:-translate-y-0.5 hover:bg-accent/90"
                >
                  Register as Owner
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-full border-2 border-border px-7 text-sm font-bold text-foreground transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  Already onboard? Sign in
                </Link>
              </div>
            </div>

            <div className="animate-fade-in-up card-elevated relative rounded-3xl border border-border bg-background p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">Today&apos;s Overview</span>
                <span className="rounded-full bg-success-muted px-2.5 py-1 text-xs font-bold text-success">
                  +12.4%
                </span>
              </div>

              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-muted-foreground">
                      <Calendar className="size-4 text-foreground" /> Bookings today
                    </span>
                    <span className="font-bold text-foreground">38</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <div className="h-2 w-[76%] rounded-full bg-accent" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-muted-foreground">
                      <Wallet className="size-4 text-success" /> Revenue
                    </span>
                    <span className="font-bold text-foreground">Rs 84,200</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <div className="h-2 w-[62%] rounded-full bg-success" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-muted-foreground">
                      <TrendingUp className="size-4 text-warning" /> Court occupancy
                    </span>
                    <span className="font-bold text-foreground">91%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <div className="h-2 w-[91%] rounded-full bg-warning" />
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-foreground/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-6 -left-6 size-24 rounded-full bg-accent/20 blur-2xl" />
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Final CTA                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-foreground py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-balance text-background sm:text-4xl">
              Ready to grow your arena business?
            </h2>
            <p className="mt-3 text-background/85">
              Join arena owners and administrators already running their business on ArenaHub.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-sm font-bold text-accent-foreground shadow-lg transition-transform hover:-translate-y-0.5"
              >
                Register Your Arena
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-full border-2 border-background/50 px-7 text-sm font-bold text-background transition-colors hover:bg-background/10"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                            */}
        {/* ---------------------------------------------------------------- */}
        <footer className="border-t border-border bg-card py-14">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
              <div className="col-span-2">
                <Logo />
                <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                  Pakistan&apos;s sports arena management platform — the console for arena owners and
                  platform administrators.
                </p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Platform</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>
                    <a href="#features" className="hover:text-foreground">
                      Features
                    </a>
                  </li>
                  <li>
                    <a href="#how-it-works" className="hover:text-foreground">
                      How it Works
                    </a>
                  </li>
                  <li>
                    <a href="#owners" className="hover:text-foreground">
                      For Owners
                    </a>
                  </li>
                  <li>
                    <Link href="/admin/login" className="hover:text-foreground">
                      Admin Console
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">Company</h4>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>
                    <AboutDialog trigger={<button className="hover:text-foreground">About Us</button>} />
                  </li>
                  <li>
                    <ContactDialog trigger={<button className="hover:text-foreground">Contact</button>} />
                  </li>
                  <li>
                    <Link href="/login" className="hover:text-foreground">
                      Sign In
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="hover:text-foreground">
                      Get Started
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
              <span>© 2026 Arena Hub. All rights reserved.</span>
              <span>Made for sport in Pakistan.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
