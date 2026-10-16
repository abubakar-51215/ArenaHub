import type { ReactNode } from "react";

import { ArenaMark } from "@/components/brand/arena-mark";
import { AuthPhotoPanel } from "@/components/auth/auth-photo-panel";

interface AuthStat {
  value: string;
  label: string;
}

type AuthVariant = "owner" | "admin";

interface SplitAuthShellProps {
  /** Legacy compatibility: some pages still pass only `badge`/`caption`.
   * Resolve the variant from those when `variant` is omitted. */
  variant?: AuthVariant;
  /** Explicit per-page, not derived from variant — same reasoning as
   * quote/stats already being explicit despite also "belonging" to a
   * variant in spirit. Every real usage passes "" here; the photo is
   * decorative (the quote/stats carry the real meaning as actual DOM
   * text), matching the prototypes' own alt="" and standard WCAG guidance
   * for decorative images. */
  imageSrc: string;
  imageAlt: string;
  /** Legacy compatibility: pages may still pass `badge` and `caption` while
   * the rest of the app uses `credit`/`quote`/`stats`. */
  badge?: string;
  caption?: {
    title?: ReactNode;
    desc?: string;
  };
  /** The floating pill's text, e.g. "328 arenas live tonight". Present on
   * every real screen in the prototypes, never absent — required, not
   * optional. */
  credit?: string;
  quote?: {
    eyebrow?: string;
    /** Wrap the emphasized phrase in <em> for the lime color. */
    title?: ReactNode;
    desc?: string;
  };
  /** Every prototype instance (owner sign-in, admin sign-in, signup) uses
   * exactly three. */
  stats?: readonly [AuthStat, AuthStat, AuthStat];
  children: ReactNode;
}

const BRAND_SUBTITLE: Record<AuthVariant, string> = {
  owner: "Owner console",
  admin: "Platform admin",
};

function BrandMark() {
  return <ArenaMark tone="system" className="size-8 shrink-0" />;
}

/**
 * Ink/lime auth shell matching the arena-hub-{signin,signup} prototypes: a
 * real form panel beside a real venue-photo panel (desaturated, scrimmed,
 * quote + stats on top). Replaces the earlier SVG-pitch-art version — the
 * prototypes moved from drawn art to photography, so this component did
 * too (see components/auth/auth-photo-panel.tsx for the photo stack
 * itself).
 *
 * The side panel is fully removed below `lg` (1024px) via `hidden lg:flex`
 * on AuthPhotoPanel's own root, not resized.
 *
 * The subtitle under "Arena Hub" uses `text-muted-foreground` rather than
 * the prototype's literal `#A9B5AE` — that color was authored for the dark
 * rail sidebar elsewhere in the dashboard prototype and reused here
 * against the light form panel without adjustment (contrast ratio ~1.9:1
 * against paper, well under WCAG AA). `--muted-foreground` is this
 * codebase's already-proven legible secondary-text color against a
 * white/paper card.
 */
export function SplitAuthShell({
  variant,
  imageSrc,
  imageAlt,
  credit,
  quote,
  stats,
  badge,
  caption,
  children,
}: SplitAuthShellProps) {
  const resolvedVariant = variant ?? (badge?.toLowerCase().includes("admin") ? "admin" : "owner");
  const resolvedCredit =
    credit ?? (resolvedVariant === "admin" ? "Platform live now" : "328 arenas live tonight");
  const resolvedQuote = quote ?? {
    eyebrow: resolvedVariant === "admin" ? "Arena Hub for admins" : "Arena Hub for owners",
    title:
      caption?.title ??
      (resolvedVariant === "admin" ? "Keep the platform running." : "Manage. Grow. Thrive."),
    desc:
      caption?.desc ??
      (resolvedVariant === "admin"
        ? "Verify new owners, monitor bookings, and keep standards consistent across the platform."
        : "All your arenas, bookings and analytics in one place."),
  };
  const resolvedStats =
    stats ??
    ([
      {
        value: resolvedVariant === "admin" ? "24/7" : "328",
        label: resolvedVariant === "admin" ? "Platform uptime" : "Arenas listed",
      },
      {
        value: resolvedVariant === "admin" ? "99.9%" : "0%",
        label: resolvedVariant === "admin" ? "Verification rate" : "Setup fees",
      },
      {
        value: resolvedVariant === "admin" ? "Live" : "24/7",
        label: resolvedVariant === "admin" ? "Monitor mode" : "Booking availability",
      },
    ] as const);

  return (
    <div data-theme="arena" className="grid min-h-screen bg-card lg:grid-cols-2">
      <div className="mx-auto flex w-full max-w-[640px] flex-col justify-center overflow-y-auto px-6 py-10 sm:px-[8vw]">
        <div className="mb-11 flex items-center gap-2.5">
          <BrandMark />
          <div className="font-display leading-[1.05] font-bold tracking-[-0.01em] text-foreground [font-variation-settings:'wdth'_100]">
            Arena Hub
            <small className="mt-0.5 block text-[12px] tracking-[0.2em] text-muted-foreground uppercase">
              {BRAND_SUBTITLE[resolvedVariant]}
            </small>
          </div>
        </div>

        {children}
      </div>

      <AuthPhotoPanel
        imageSrc={imageSrc}
        imageAlt={imageAlt}
        credit={resolvedCredit}
        quote={resolvedQuote}
        stats={resolvedStats}
      />
    </div>
  );
}
