import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Adds standard inner padding to the body. Default true. Disable for tables that own their padding. */
  padded?: boolean;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-card",
        "shadow-[0_1px_2px_hsl(var(--foreground)/0.04)]",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex flex-col gap-2 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(padded && "p-5 sm:p-6", bodyClassName)}>{children}</div>
    </section>
  );
}
