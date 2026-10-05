import { cn } from "@/lib/utils";

/** ArenaHub wordmark — gradient chevron/mountain glyph + "ARENA HUB" (per wireframe). */
/**
 * `tone="dark"` is for dark surfaces such as the sidebars. Light is the default.
 * Colours come from the ink, paper and lime tokens, so the wordmark stays
 * readable on either surface.
 */
export function Logo({
  className,
  compact = false,
  tone = "light",
}: {
  className?: string;
  compact?: boolean;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 3 4 27h7l5-10 5 10h7L16 3Z" className={dark ? "fill-paper" : "fill-ink"} />
        <path d="M16 12l-4.5 9h9L16 12Z" className={dark ? "fill-lime" : "fill-lime-deep"} />
      </svg>
      {!compact && (
        <span className="text-lg leading-none font-extrabold tracking-tight">
          <span className={dark ? "text-paper" : "text-ink"}>ARENA</span>{" "}
          <span className={dark ? "text-lime" : "text-lime-deep"}>HUB</span>
        </span>
      )}
    </div>
  );
}
