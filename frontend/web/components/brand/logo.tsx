import { ArenaMark } from "@/components/brand/arena-mark";
import { cn } from "@/lib/utils";

/**
 * The ArenaHub mark with the wordmark (design/brand/arenahub-logo.html).
 * `tone="dark"` is for dark surfaces such as the sidebars. Light is the default.
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
      <ArenaMark tone={dark ? "dark" : "light"} size={32} title={compact ? "ArenaHub" : undefined} />
      {!compact && (
        <span className={cn("font-display text-xl leading-none font-extrabold tracking-tight", dark ? "text-paper" : "text-ink")}>
          ArenaHub
        </span>
      )}
    </div>
  );
}
