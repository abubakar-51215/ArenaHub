"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling box that tells the user there is more to the right:
 * a fade on the right edge and a "Swipe to see more" line below it while
 * anything is hidden. Both go away once the end is reached (or when nothing
 * overflows). Used by the shared Table, the Live Board and the Calendar.
 */
export function ScrollCue({
  children,
  className,
  scrollClassName,
  hint = "Swipe to see more",
  fadeFrom = "from-card",
}: {
  children: React.ReactNode;
  className?: string;
  scrollClassName?: string;
  hint?: string;
  fadeFrom?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreToRight, setMoreToRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setMoreToRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative w-full", className)}>
      <div ref={scrollRef} className={cn("overflow-x-auto", scrollClassName)}>
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l to-transparent transition-opacity",
          fadeFrom,
          moreToRight ? "opacity-100" : "opacity-0",
        )}
      />
      {moreToRight && (
        <p className="py-1 text-center text-sm text-muted-foreground lg:hidden">{hint}</p>
      )}
    </div>
  );
}
