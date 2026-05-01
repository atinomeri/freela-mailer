import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ToolbarProps {
  children: ReactNode;
  className?: string;
  /** When true, renders without the surrounding card chrome. Use inside SectionCard headers. */
  bare?: boolean;
}

export function Toolbar({ children, className, bare = false }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center",
        !bare &&
          "rounded-2xl border border-border/70 bg-card p-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Stretches its child to fill remaining row space — useful for putting Search on the left and actions on the right. */
export function ToolbarSpacer({ className }: { className?: string }) {
  return <div className={cn("hidden flex-1 sm:block", className)} aria-hidden />;
}
