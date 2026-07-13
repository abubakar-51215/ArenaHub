import { cn } from "@/lib/utils";

/** ArenaHub wordmark — green chevron/mountain glyph + "ARENA HUB" (per wireframe). */
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
        <path d="M16 3 4 27h7l5-10 5 10h7L16 3Z" fill="#16a34a" />
        <path d="M16 12l-4.5 9h9L16 12Z" fill="#4ade80" />
      </svg>
      {!compact && (
        <span className="text-lg leading-none font-extrabold tracking-tight">
          <span className="text-foreground">ARENA</span>{" "}
          <span className="text-emerald-600">HUB</span>
        </span>
      )}
    </div>
  );
}
