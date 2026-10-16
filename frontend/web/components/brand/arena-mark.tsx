import { MARK_INNER } from "@/components/brand/arena-mark.generated";
import { cn } from "@/lib/utils";

/**
 * The ArenaHub mark (design/brand/arenahub-logo.html): a padel racket and a cricket bat form the A,
 * inside the arena ring, with a football. Still. Two drawings, one per tone, and CSS picks one:
 *   tone="dark"    lime shapes, for dark surfaces such as the owner and admin rail (dark in both themes)
 *   tone="light"   ink shapes, for light surfaces
 *   tone="theme"   follows html[data-theme] (owner and admin pages)
 *   tone="system"  follows the system colour scheme (the sign-in pages)
 */
export function ArenaMark({
  tone = "theme",
  size,
  className,
  title,
}: {
  tone?: "dark" | "light" | "theme" | "system";
  size?: number;
  className?: string;
  title?: string;
}) {
  const style = size ? { width: size, height: size } : undefined;
  const svg = (inner: string, cls: string) => (
    <svg
      className={cls}
      viewBox="0 0 120 120"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
  return (
    <span className={cn("am", `am-${tone}`, className)} style={style}>
      {svg(MARK_INNER.light, "am-l")}
      {svg(MARK_INNER.dark, "am-d")}
    </span>
  );
}
