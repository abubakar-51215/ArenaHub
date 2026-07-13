import * as React from "react";

import { cn } from "@/lib/utils";

/** Lightweight styled native <select> — sufficient for the owner forms. */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
