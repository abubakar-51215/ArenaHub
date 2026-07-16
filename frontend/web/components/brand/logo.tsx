import { cn } from "@/lib/utils";

/** ArenaHub wordmark — gradient chevron/mountain glyph + "ARENA HUB" (per wireframe). */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 32 32"
        aria-hidden
        className="size-7 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ah-mark" x1="4" y1="27" x2="28" y2="5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#16A34A" />
          </linearGradient>
        </defs>
        <path d="M16 3 4 27h7l5-10 5 10h7L16 3Z" fill="url(#ah-mark)" />
        <path d="M16 12l-4.5 9h9L16 12Z" fill="#60A5FA" />
      </svg>
      {!compact && (
        <span className="text-lg leading-none font-extrabold tracking-tight">
          <span className="text-foreground">ARENA</span>{" "}
          <span className="text-gradient-brand">HUB</span>
        </span>
      )}
    </div>
  );
}
