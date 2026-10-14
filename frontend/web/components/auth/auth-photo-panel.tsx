import Image from "next/image";
import type { ReactNode } from "react";

interface AuthStat {
  value: string;
  label: string;
}

interface AuthPhotoPanelProps {
  imageSrc: string;
  imageAlt: string;
  credit?: string;
  quote?: {
    eyebrow?: string;
    title?: ReactNode;
    desc?: string;
  };
  stats?: readonly [AuthStat, AuthStat, AuthStat];
}

/**
 * The auth shell's right-hand panel: a real venue photo, desaturated and
 * darkened to read as a backdrop, under a two-layer scrim that guarantees
 * text contrast regardless of the photo's own colors, two low-opacity
 * glows, a bottom lime rule, a floating credit pill, and the quote/stats
 * text on top. Ported from arena-hub-signin.html / arena-hub-signup.html.
 *
 * The whole stack lives in one component rather than splitting
 * photo-layers-here / quote-stats-in-the-parent — the credit pill needs the
 * same relatively-positioned stacking context as the quote/stats, so
 * keeping them together avoids threading z-index/position context between
 * two components for no real benefit.
 *
 * Layer order (bottom → top), matching the prototype's own comment:
 *   1. Container background — ink turf gradient, visible only if the photo
 *      fails to load, so a broken image degrades to something intentional.
 *   2. The photo itself, cover-fitted and filtered.
 *   3. The two-layer scrim — load-bearing for contrast, not decorative.
 *   4. Two radial glows (lime top-left, cold blue bottom-right).
 *   5. The bottom lime rule.
 *   6. The credit pill.
 *   7. Quote + stats, real DOM text, always on top with their own
 *      text-shadow as a second line of defense under the scrim.
 */
export function AuthPhotoPanel({ imageSrc, imageAlt, credit, quote, stats }: AuthPhotoPanelProps) {
  const resolvedQuote = quote ?? {
    eyebrow: "Arena Hub for owners",
    title: "Manage. Grow. Thrive.",
    desc: "All your arenas, bookings and analytics in one place.",
  };
  const resolvedStats = stats ?? [
    { value: "328", label: "Arenas listed" },
    { value: "0%", label: "Setup fees" },
    { value: "24/7", label: "Booking availability" },
  ];

  return (
    <div className="relative hidden flex-col justify-end overflow-hidden bg-[linear-gradient(160deg,#0C1F16_0%,#050B08_100%)] p-[38px] lg:flex">
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        priority
        sizes="50vw"
        className="object-cover saturate-[.72] brightness-[.62] contrast-[1.05]"
      />

      {/* Two-layer scrim: vertical (guarantees contrast where the text
          sits, near-opaque at the bottom) + a flat diagonal ink wash (ties
          any photo back to the brand palette regardless of its own
          colors). Inline style, not Tailwind arbitrary values — this is
          two full gradients with four color stops between them, and
          Tailwind's arbitrary-value bracket syntax gets fragile past one
          simple gradient. This codebase already uses inline gradients for
          exactly this reason (components/auth/auth-shell.tsx). */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(7,16,11,.97) 0%, rgba(7,16,11,.86) 26%, rgba(7,16,11,.46) 58%, rgba(7,16,11,.24) 100%), linear-gradient(150deg, rgba(15,26,21,.55) 0%, rgba(5,11,8,.35) 100%)",
        }}
      />

      <div
        className="pointer-events-none absolute -top-[14%] -left-[12%] aspect-square w-[70%]"
        style={{ backgroundImage: "radial-gradient(circle, rgba(196,245,70,.20) 0%, rgba(196,245,70,0) 68%)" }}
      />
      <div
        className="pointer-events-none absolute -right-[16%] -bottom-[18%] aspect-square w-[62%]"
        style={{ backgroundImage: "radial-gradient(circle, rgba(159,216,255,.12) 0%, rgba(159,216,255,0) 70%)" }}
      />

      {/* thin lime rule, echoes a pitch sideline without redrawing one */}
      <div
        className="absolute inset-x-0 bottom-0 z-[3] h-[3px]"
        style={{
          backgroundImage: "linear-gradient(to right, var(--accent) 0%, rgba(196,245,70,.15) 42%, transparent 100%)",
        }}
      />

      {/* venue credit — small, honest, keeps the photo from feeling like stock filler */}
      <div className="absolute top-[26px] right-[30px] z-[3] flex items-center gap-[7px] rounded-full border border-[rgba(234,246,216,.14)] bg-[rgba(7,16,11,.55)] px-[11px] py-[6px] backdrop-blur-[6px]">
        <span className="size-[6px] rounded-full bg-accent shadow-[0_0_0_3px_rgba(196,245,70,.2)]" />
        <span className="text-[12px] tracking-[0.02em] text-on-ink">{credit ?? "ArenaHub"}</span>
      </div>

      <div className="relative z-[2] max-w-[400px]">
        <p className="eyebrow mb-3.5 text-accent">{resolvedQuote.eyebrow}</p>
        <h3 className="heading mb-2.5 text-[27px] leading-[1.18] tracking-[-0.02em] text-white [text-shadow:0_1px_20px_rgba(0,0,0,.45)] [&_em]:not-italic [&_em]:text-accent">
          {resolvedQuote.title}
        </h3>
        <p className="max-w-[330px] text-[13.5px] text-on-ink-muted [text-shadow:0_1px_12px_rgba(0,0,0,.4)]">
          {resolvedQuote.desc}
        </p>
      </div>

      <div className="relative z-[2] mt-7 flex gap-[30px] border-t border-[rgba(234,246,216,.16)] pt-[22px]">
        {resolvedStats.map((stat) => (
          <div key={stat.label}>
            <b className="metric-sm block text-white">{stat.value}</b>
            <span className="text-[12px] tracking-[0.04em] text-on-ink-faint">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
